import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import { sql } from "@/lib/db";
import { ensureHousehold } from "@/lib/ensure-household";
import { ensurePageLog } from "@/lib/page-log";
import { streakEndingToday } from "@/lib/check-unlocks";
import CopyCode from "@/app/copy-code";

const WEEKDAY = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function daysUntil(due: string, today: string) {
  return Math.round(
    (Date.parse(`${due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000
  );
}

function dueLabel(due: string | null, today: string, done: boolean) {
  if (!due) return "";
  const days = daysUntil(due, today);
  if (done) return `due ${due}`;
  if (days < 0) return `due ${due} · overdue`;
  if (days === 0) return "due today";
  if (days === 1) return "due tomorrow · 1 day left";
  return `due ${due} · ${days} days left`;
}

function criteriaLabel(
  type: string,
  pages: number | null,
  title: string | null,
  scope: string,
  mode: string | null,
  days: number | null
) {
  if (type === "daily_streak") {
    const where = scope === "any" ? "in any book" : `in ${title}`;
    return `${pages} pages a day for ${days} days ${where}`;
  }
  if (scope === "any") return `${pages} pages in any book`;
  if (type === "finish_book") return `finish ${title}`;
  if (mode === "read") return `${pages} pages in ${title}`;
  return `page ${pages} in ${title}`;
}

export default async function KidProgressPage({
  params
}: {
  params: Promise<{ childId: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const { childId } = await params;
  const user = await currentUser();
  const email =
    user?.primaryEmailAddress?.emailAddress ?? `${userId}@users.invalid`;
  const household = await ensureHousehold({ clerkUserId: userId, email });
  const db = sql();
  await ensurePageLog();

  const kids = await db`
    SELECT id, display_name, daily_goal_pages
    FROM children
    WHERE id = ${childId}::uuid AND household_id = ${household.household_id}::uuid
    LIMIT 1
  `;
  if (!kids[0]) notFound();
  const kid = kids[0] as {
    id: string;
    display_name: string;
    daily_goal_pages: number;
  };
  const goal = Number(kid.daily_goal_pages) || 5;

  const todayRow = await db`SELECT CURRENT_DATE::text AS today`;
  const today = String((todayRow[0] as { today: string }).today);
  const monthStart = `${today.slice(0, 7)}-01`;

  const log = (await db`
    SELECT day::text AS day, book_id::text AS book_id, SUM(pages)::int AS pages
    FROM page_log
    WHERE child_id = ${kid.id}::uuid
    GROUP BY day, book_id
  `) as { day: string; book_id: string; pages: number }[];
  const byDay = new Map<string, number>();
  const byBook = new Map<string, number>();
  let across = 0;
  for (const entry of log) {
    const pages = Number(entry.pages);
    byDay.set(entry.day, (byDay.get(entry.day) ?? 0) + pages);
    byBook.set(entry.book_id, (byBook.get(entry.book_id) ?? 0) + pages);
    across += pages;
  }

  const progress = (await db`
    SELECT p.book_id::text AS book_id, b.title, p.max_location, p.total_locations
    FROM progress p
    JOIN books b ON b.id = p.book_id
    WHERE p.child_id = ${kid.id}::uuid
    ORDER BY p.updated_at DESC
  `) as {
    book_id: string;
    title: string;
    max_location: number;
    total_locations: number;
  }[];
  const progressByBook = new Map(progress.map((p) => [p.book_id, p]));

  const assignments = (await db`
    SELECT cl.name AS class_name, a.title, a.criteria_type,
           (a.criteria_json->>'pages')::int AS pages,
           a.due_date::text AS due_date,
           a.book_id::text AS book_id, b.title AS book_title,
           COALESCE(p.max_location, 0) AS max_location,
           COALESCE(p.total_locations, 0) AS total_locations
    FROM enrollments e
    JOIN classes cl ON cl.id = e.class_id
    JOIN assignments a ON a.class_id = cl.id
    JOIN books b ON b.id = a.book_id
    LEFT JOIN progress p ON p.child_id = e.child_id AND p.book_id = a.book_id
    WHERE e.child_id = ${kid.id}::uuid
    ORDER BY a.due_date NULLS LAST, a.created_at
  `) as {
    class_name: string;
    title: string;
    criteria_type: string;
    pages: number | null;
    due_date: string | null;
    book_id: string;
    book_title: string;
    max_location: number;
    total_locations: number;
  }[];

  const rewards = (await db`
    SELECT r.id, r.face_value, r.status, r.criteria_type, r.scope,
           r.book_id::text AS book_id,
           (r.criteria_json->>'pages')::int AS pages,
           (r.criteria_json->>'days')::int AS days,
           r.criteria_json->>'mode' AS mode,
           r.unlocked_at::text AS unlocked_at,
           b.title,
           rr.code
    FROM rewards r
    LEFT JOIN books b ON b.id = r.book_id
    LEFT JOIN reward_releases rr ON rr.reward_id = r.id
    WHERE r.child_id = ${kid.id}::uuid
    ORDER BY r.status, r.created_at
  `) as {
    id: string;
    face_value: string;
    status: string;
    criteria_type: string;
    scope: string;
    book_id: string | null;
    pages: number | null;
    days: number | null;
    mode: string | null;
    unlocked_at: string | null;
    title: string | null;
    code: string | null;
  }[];

  const start = new Date(`${monthStart}T00:00:00Z`);
  const monthDays = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
  const cells: { day: string | null; pages: number }[] = [];
  for (let i = 0; i < start.getUTCDay(); i++) cells.push({ day: null, pages: 0 });
  for (let n = 1; n <= monthDays; n++) {
    const day = `${today.slice(0, 7)}-${String(n).padStart(2, "0")}`;
    cells.push({ day, pages: byDay.get(day) ?? 0 });
  }
  const monthLabel = start.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const last14 = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - (13 - i));
    const day = d.toISOString().slice(0, 10);
    return {
      day,
      label: WEEKDAY[d.getUTCDay()],
      pages: byDay.get(day) ?? 0,
      isToday: day === today
    };
  });
  const chartMax = Math.max(goal, ...last14.map((d) => d.pages), 1);
  const dueByDay = new Map<string, "overdue" | "done" | "open">();
  let overdueCount = 0;
  let allDone = assignments.length > 0;
  for (const assignment of assignments) {
    const max = Number(assignment.max_location);
    const total = Number(assignment.total_locations);
    const target = Number(assignment.pages ?? 0);
    const done =
      assignment.criteria_type === "finish_book"
        ? total > 0 && max >= total - 1
        : max >= target;
    if (!done) allDone = false;
    if (!done && assignment.due_date && assignment.due_date < today) overdueCount += 1;
    if (!assignment.due_date) continue;
    const status: "overdue" | "done" | "open" = done
      ? "done"
      : assignment.due_date < today
        ? "overdue"
        : "open";
    const existing = dueByDay.get(assignment.due_date);
    const next =
      existing === "overdue" || status === "overdue"
        ? "overdue"
        : existing === "done" && status === "done"
          ? "done"
          : status === "done" && !existing
            ? "done"
            : "open";
    dueByDay.set(assignment.due_date, next);
  }
  const kidStatus: "overdue" | "done" | "open" = overdueCount > 0
    ? "overdue"
    : allDone
      ? "done"
      : "open";
  const classNames = [...new Set(assignments.map((a) => a.class_name))];
  const classStatuses = classNames.map((name) => {
    const rows = assignments.filter((a) => a.class_name === name);
    let classOverdue = 0;
    let classDone = rows.length > 0;
    for (const assignment of rows) {
      const max = Number(assignment.max_location);
      const total = Number(assignment.total_locations);
      const target = Number(assignment.pages ?? 0);
      const done =
        assignment.criteria_type === "finish_book"
          ? total > 0 && max >= total - 1
          : max >= target;
      if (!done) classDone = false;
      if (!done && assignment.due_date && assignment.due_date < today) classOverdue += 1;
    }
    const status: "overdue" | "done" | "open" = classOverdue > 0
      ? "overdue"
      : classDone
        ? "done"
        : "open";
    return { name, status, overdue: classOverdue, assignments: rows.length };
  });

  return (
    <main>
      <header className="top">
        <Link href="/parent">Back to parent</Link>
        <Link href={`/kid/${kid.id}`}>Open kid view</Link>
      </header>
      <h1 style={{ fontStyle: "italic", textDecoration: "underline", color: "var(--ink)" }}>
        {kid.display_name}
      </h1>
      <p>Colored days met the goal. A green dot is finished. A red dot is overdue.</p>

      {assignments.length > 0 && (
        <div className="card">
          <h2 style={{ textDecoration: "underline" }}>Classes</h2>
          {[...new Set(assignments.map((a) => a.class_name))].map((className) => {
            const classItems = assignments.filter((a) => a.class_name === className);
            const summary = classStatuses.find((k) => k.name === className);
            const classStatus = summary?.status ?? "open";
            const classOverdue = summary?.overdue ?? 0;
            return (
              <div key={className}>
                <p className={`group-head${classStatus === "overdue" ? " overdue" : classStatus === "done" ? " unlocked" : ""}`}>
                  {className}
                  <span className={`count${classOverdue > 0 ? " overdue" : " unlocked"}`}>
                    {" · "}
                    {classOverdue} overdue
                  </span>
                </p>
                <ul className="reward-list">
                  {classItems.map((assignment) => {
                    const max = Number(assignment.max_location);
                    const total = Number(assignment.total_locations);
                    const target = Number(assignment.pages ?? 0);
                    const done =
                      assignment.criteria_type === "finish_book"
                        ? total > 0 && max >= total - 1
                        : max >= target;
                    const overdue = !done && !!assignment.due_date && assignment.due_date < today;
                    const shown =
                      assignment.criteria_type === "finish_book"
                        ? `${max} / ${total || "?"}`
                        : `${Math.min(max, target)} / ${target}`;
                    const due = dueLabel(assignment.due_date, today, done);
                    return (
                      <li
                        key={`${assignment.class_name}-${assignment.title}`}
                        className={done ? "unlocked" : overdue ? "overdue" : ""}
                      >
                        {assignment.title} · {assignment.book_title}
                        {due ? ` · ${due}` : ""} — {done ? "done" : shown}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      <div className="card">
        <h2 style={{ textDecoration: "underline" }}>Last 14 days</h2>
        <p className="muted">Pages read. Green bars met the {goal}-page goal.</p>
        <div className="chart">
          {last14.map((d) => {
            const met = d.pages >= goal;
            const height = Math.round((d.pages / chartMax) * 100);
            return (
              <div key={d.day} className={`chart-col${d.isToday ? " today" : ""}`}>
                <div className="chart-track">
                  <div
                    className={`chart-bar${met ? " on" : ""}`}
                    style={{ height: `${d.pages > 0 ? Math.max(Math.round((d.pages / chartMax) * 100), 8) : 0}px` }}
                    title={`${d.pages} pages`}
                  />
                </div>
                <span>{d.pages}</span>
                <span>{d.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card">
        <h2 style={{ textDecoration: "underline" }}>{monthLabel}</h2>
        <div className="cal-head">
          {WEEKDAY.map((label) => (
            <div key={label}>{label}</div>
          ))}
        </div>
        <div className="cal">
          {cells.map((cell, i) => {
            const status = cell.day ? dueByDay.get(cell.day) : undefined;
            const isToday = cell.day === today;
            const on = cell.day && cell.pages >= goal;
            return (
              <div
                key={cell.day ?? `pad-${i}`}
                className={`cal-day${on ? " on" : ""}${isToday ? " today" : ""}`}
              >
                {cell.day ? (
                  <>
                    <span>{Number(cell.day.slice(8))}</span>
                    <small>{cell.pages || ""}</small>
                    {status && (
                      <small className={status === "overdue" ? "overdue" : status === "done" ? "unlocked" : ""}>
                        •
                      </small>
                    )}
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
        <div className="legend">
          <span><span className="swatch unlocked">•</span> finished</span>
          <span><span className="swatch overdue">•</span> overdue</span>
          <span><span className="swatch">•</span> open</span>
        </div>
      </div>

      <div className="card">
        <h2 style={{ textDecoration: "underline" }}>Rewards</h2>
        {rewards.length === 0 ? (
          <p>No rewards yet.</p>
        ) : (
          rewards.map((reward) => {
            const target =
              reward.criteria_type === "daily_streak"
                ? Number(reward.days ?? 0)
                : reward.criteria_type === "finish_book"
                  ? Number(progressByBook.get(reward.book_id ?? "")?.total_locations ?? 0)
                  : Number(reward.pages ?? 0);
            let current = 0;
            if (reward.criteria_type === "daily_streak") {
              const source = new Map<string, number>();
              for (const entry of log) {
                if (reward.scope === "any" || entry.book_id === reward.book_id) {
                  source.set(entry.day, (source.get(entry.day) ?? 0) + Number(entry.pages));
                }
              }
              current = streakEndingToday(source, today, Number(reward.pages ?? 0));
            } else if (reward.criteria_type === "finish_book") {
              current = Number(progressByBook.get(reward.book_id ?? "")?.max_location ?? 0);
            } else if (reward.scope === "any") {
              current = across;
            } else if (reward.mode === "read") {
              current = byBook.get(reward.book_id ?? "") ?? 0;
            } else {
              current = Number(progressByBook.get(reward.book_id ?? "")?.max_location ?? 0);
            }
            const shown = target > 0 ? Math.min(current, target) : current;
            const fill = target > 0 ? Math.round((shown / target) * 100) : 0;
            const unlocked = reward.status === "unlocked";
            const fillClass = fill < 40 ? "low" : fill < 75 ? "mid" : "";
            return (
              <div key={reward.id} className={`reward-card${unlocked ? " unlocked" : ""}`}>
                <p className="reward-card-title">{reward.face_value}</p>
                <p className="reward-card-status muted">
                  {criteriaLabel(reward.criteria_type, reward.pages, reward.title, reward.scope, reward.mode, reward.days)}
                </p>
                <p className={unlocked ? "unlocked" : "muted"} style={{ margin: "0 0 0.2rem", fontSize: "0.85rem" }}>
                  {unlocked
                    ? `Unlocked ${reward.unlocked_at?.slice(0, 10) ?? ""}`
                    : `${shown} / ${target || "?"}`}
                </p>
                {!unlocked && target > 0 && (
                  <>
                    <div className="progress-bar">
                      <div className={`progress-fill ${fillClass}`} style={{ width: `${fill}%` }} />
                    </div>
                    <p className="progress-pct">{fill}%</p>
                  </>
                )}
                {unlocked && reward.code && (
                  <p style={{ margin: "0.45rem 0 0" }}>
                    <CopyCode code={reward.code} />
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="card">
        <h2 style={{ textDecoration: "underline" }}>Books</h2>
        {progress.length === 0 ? (
          <p>No reading yet.</p>
        ) : (
          progress.map((p) => {
            const pct =
              p.total_locations > 0
                ? Math.min(100, Math.round((p.max_location / p.total_locations) * 100))
                : 0;
            const bookAssignments = assignments.filter((a) => a.book_id === p.book_id);
            let anyOverdue = false;
            let bookDone = bookAssignments.length > 0;
            for (const assignment of bookAssignments) {
              const max = Number(assignment.max_location);
              const total = Number(assignment.total_locations);
              const target = Number(assignment.pages ?? 0);
              const done =
                assignment.criteria_type === "finish_book"
                  ? total > 0 && max >= total - 1
                  : max >= target;
              if (!done) bookDone = false;
              if (!done && assignment.due_date && assignment.due_date < today) anyOverdue = true;
            }
            const bookStatus: "overdue" | "done" | "open" = anyOverdue
              ? "overdue"
              : bookDone
                ? "done"
                : "open";
            return (
              <div key={p.book_id} className="kid-block">
                <p className={bookStatus === "overdue" ? "overdue" : bookStatus === "done" ? "unlocked" : ""} style={{ fontWeight: 400, margin: "0 0 0.2rem" }}>
                  {p.title}
                </p>
                <p className="muted" style={{ margin: "0 0 0.25rem" }}>
                  {p.max_location} / {p.total_locations || "?"} · {pct}%
                </p>
                {bookAssignments.length > 0 && (
                  <ul className="reward-list">
                    {bookAssignments.map((assignment) => {
                      const max = Number(assignment.max_location);
                      const total = Number(assignment.total_locations);
                      const target = Number(assignment.pages ?? 0);
                      const done =
                        assignment.criteria_type === "finish_book"
                          ? total > 0 && max >= total - 1
                          : max >= target;
                      const overdue = !done && !!assignment.due_date && assignment.due_date < today;
                      const due = dueLabel(assignment.due_date, today, done);
                      return (
                        <li
                          key={`${assignment.class_name}-${assignment.title}`}
                          className={done ? "unlocked" : overdue ? "overdue" : ""}
                        >
                          {assignment.class_name}
                          {due ? ` · ${due}` : ""}
                        </li>
                      );
                    })}
                  </ul>
                )}
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })
        )}
      </div>
    </main>
  );
}
