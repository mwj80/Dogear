import Link from "next/link";
import { requestGameAccount } from "@/app/parent/kid/actions";
import { signOutKid } from "../sign-in/actions";
import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import { ensurePageLog } from "@/lib/page-log";
import { ensureSchema } from "@/lib/ensure-schema";
import { streakEndingToday } from "@/lib/check-unlocks";

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
    return `reading ${pages} pages a day for ${days} days ${where}`;
  }
  if (scope === "any") return `reading ${pages} pages in any book`;
  if (type === "finish_book") return `finishing ${title}`;
  if (mode === "read") return `reading ${pages} pages in ${title}`;
  return `reaching page ${pages} in ${title}`;
}

export default async function KidHomePage({
  params,
  searchParams
}: {
  params: Promise<{ childId: string }>;
  searchParams: Promise<{ requested?: string }>;
}) {
  const { childId } = await params;
  const query = await searchParams;
  const requested = query.requested === "1";
  const db = sql();
  await ensurePageLog();
  await ensureSchema();

  const kids = await db`
    SELECT id, display_name, daily_goal_pages, COALESCE(can_self_purchase, false) AS can_self_purchase
    FROM children WHERE id = ${childId}::uuid LIMIT 1
  `;
  if (!kids[0]) notFound();

  const todayRow = await db`SELECT CURRENT_DATE::text AS today`;
  const today = String((todayRow[0] as { today: string }).today);

  const books = await db`
    SELECT b.slug, b.title, b.author FROM books b JOIN kid_books kb ON kb.book_id = b.id WHERE kb.child_id = ${childId}::uuid ORDER BY b.title
  `;

  const log = (await db`
    SELECT day::text AS day, book_id::text AS book_id, SUM(pages)::int AS pages
    FROM page_log
    WHERE child_id = ${childId}::uuid
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
    WHERE p.child_id = ${childId}::uuid
    ORDER BY p.updated_at DESC
  `) as {
    book_id: string;
    title: string;
    max_location: number;
    total_locations: number;
  }[];
  const progressByBook = new Map(progress.map((p) => [p.book_id, p]));

  const rewards = (await db`
    SELECT r.id, r.face_value, r.status, r.criteria_type, r.scope,
           r.book_id::text AS book_id,
           (r.criteria_json->>'pages')::int AS pages,
           (r.criteria_json->>'days')::int AS days,
           r.criteria_json->>'mode' AS mode,
           r.unlocked_at::text AS unlocked_at,
           b.title, b.slug
    FROM rewards r
    LEFT JOIN books b ON b.id = r.book_id
    WHERE r.child_id = ${childId}::uuid
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
    slug: string | null;
  }[];

  const assignments = (await db`
    SELECT cl.name AS class_name, a.title, a.criteria_type,
           (a.criteria_json->>'pages')::int AS pages,
           a.due_date::text AS due_date,
           b.title AS book_title, b.slug,
           COALESCE(p.max_location, 0) AS max_location,
           COALESCE(p.total_locations, 0) AS total_locations
    FROM enrollments e
    JOIN classes cl ON cl.id = e.class_id
    JOIN assignments a ON a.class_id = e.class_id
    JOIN books b ON b.id = a.book_id
    LEFT JOIN progress p ON p.child_id = e.child_id AND p.book_id = a.book_id
    WHERE e.child_id = ${childId}::uuid
    ORDER BY a.due_date NULLS LAST, a.created_at
  `) as {
    class_name: string;
    title: string;
    criteria_type: string;
    pages: number | null;
    due_date: string | null;
    book_title: string;
    slug: string;
    max_location: number;
    total_locations: number;
  }[];

  const kid = kids[0] as {
    id: string;
    display_name: string;
    can_self_purchase: boolean;
    daily_goal_pages: number;
  };
  const goal = Number(kid.daily_goal_pages) || 5;
  const pagesToday = byDay.get(today) ?? 0;
  const goalMet = pagesToday >= goal;
  const streak = streakEndingToday(byDay, today, goal);
  const WEEKDAY = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
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
  const classNames = [...new Set(assignments.map((a) => a.class_name))];
  const classStatuses = classNames.map((name) => {
    const rows = assignments.filter((a) => a.class_name === name);
    let classOverdue = 0;
    let allDone = rows.length > 0;
    for (const assignment of rows) {
      const max = Number(assignment.max_location);
      const total = Number(assignment.total_locations);
      const target = Number(assignment.pages ?? 0);
      const done =
        assignment.criteria_type === "finish_book"
          ? total > 0 && max >= total - 1
          : max >= target;
      if (!done) allDone = false;
      if (!done && assignment.due_date && assignment.due_date < today) classOverdue += 1;
    }
    const status: "overdue" | "done" | "open" = classOverdue > 0
      ? "overdue"
      : allDone
        ? "done"
        : "open";
    return { name, status, overdue: classOverdue, assignments: rows.length };
  });

  return (
    <main>
      <header className="top">
        <Link href="/parent">Back to parent</Link>
        <form action={signOutKid}>
          <button type="submit" className="btn secondary" style={{ padding: "0.25rem 0.6rem" }}>
            Sign out
          </button>
        </form>
      </header>
      <h1 style={{ fontStyle: "italic", textDecoration: "underline", color: "var(--ink)" }}>
        Hi, {kid.display_name}
      </h1>
      <p>Pick a book and earn your rewards.</p>
      {requested && (
        <div className="card" style={{ borderColor: "#2e7d32" }}>
          <p className="unlocked">Request sent. A parent will approve it before it is used.</p>
        </div>
      )}
      <div className="card" style={{ borderColor: goalMet ? "var(--ok)" : undefined }}>
        <p style={{ margin: "0 0 0.2rem", color: "var(--ink)", fontWeight: 600 }}>
          Today: {pagesToday} / {goal} pages
          {goalMet ? " · Goal met!" : ` · ${goal - pagesToday} left`}
        </p>
        <p className={streak > 0 ? "unlocked" : "muted"} style={{ margin: 0 }}>
          {streak > 0
            ? `${streak}-day streak`
            : "No streak yet — read today to start one"}
        </p>
      </div>
      <div className="card">
        <h2 style={{ textDecoration: "underline" }}>Last 14 days</h2>
        <p className="muted">Pages read. Green bars met the {goal}-page goal.</p>
        <div className="chart">
          {last14.map((d) => {
            const met = d.pages >= goal;
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
                <p className="group-head">
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
                    const goalText =
                      assignment.criteria_type === "finish_book"
                        ? `Finish ${assignment.book_title}`
                        : `Read ${target} pages in ${assignment.book_title}`;
                    const due = dueLabel(assignment.due_date, today, done);
                    const fill = target > 0 ? Math.round((Math.min(max, target) / target) * 100) : 0;
                    return (
                      <li key={`${assignment.slug}-${assignment.title}`}>
                        <Link href={`/kid/${kid.id}/book/${assignment.slug}`}>{assignment.title}</Link>
                        {" · "}
                        {goalText}
                        {due ? ` · ${due}` : ""}
                        {" — "}
                        <span className={done ? "unlocked" : overdue ? "overdue" : ""}>
                          {done ? "done" : shown}
                        </span>
                        {!done && target > 0 && (
                          <div className="progress-bar" style={{ marginTop: "0.25rem" }}>
                            <div className="progress-fill" style={{ width: `${fill}%` }} />
                          </div>
                        )}
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
            return (
              <div key={reward.id} className="kid-block">
                <p style={{ margin: "0 0 0.2rem", fontWeight: 400 }}>
                  {reward.face_value} for {criteriaLabel(reward.criteria_type, reward.pages, reward.title, reward.scope, reward.mode, reward.days)}
                </p>
                <p className={unlocked ? "unlocked" : "muted"} style={{ margin: "0 0 0.35rem", fontWeight: 400 }}>
                  {unlocked
                    ? `unlocked ${reward.unlocked_at?.slice(0, 10) ?? ""}`
                    : `${shown} / ${target || "?"}`}
                </p>
                {!unlocked && target > 0 && (
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${fill}%` }} />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
      <div className="card">
        <p style={{ display: "flex", alignItems: "baseline", gap: "1rem", flexWrap: "wrap" }}>
          <span className="section-head" style={{ margin: 0 }}>Books</span>
          {kid.can_self_purchase && (
            <Link href={`/kid/${kid.id}/shop`}>Shop for books</Link>
          )}
        </p>
        {books.length === 0 ? (
          <p>No books on your reader yet.</p>
        ) : (
          <ul className="reward-list">
            {books.map((book) => {
              const b = book as { slug: string; title: string; author: string };
              const bookAssignments = assignments.filter((a) => a.slug === b.slug);
              return (
                <li key={b.slug}>
                  <Link href={`/kid/${kid.id}/book/${b.slug}`}>{b.title}</Link>
                  {b.author ? ` — ${b.author}` : ""}
                  {bookAssignments.length > 0 && (
                    <span>
                      {" · "}
                      {bookAssignments.map((assignment, i) => {
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
                          <span
                            key={`${assignment.class_name}-${assignment.title}`}
                            className={done ? "unlocked" : overdue ? "overdue" : ""}
                          >
                            {i > 0 ? ", " : ""}
                            {assignment.class_name}
                            {due ? ` · ${due}` : ""}
                          </span>
                        );
                      })}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="card">
        <h2 style={{ textDecoration: "underline" }}>Game account</h2>
        <p className="muted">Ask a parent to update where rewards are sent. Nothing changes until they approve.</p>
        <form action={requestGameAccount} className="stack">
          <input type="hidden" name="child_id" value={kid.id} />
          <label>
            Game
            <select name="provider" required defaultValue="roblox">
              <option value="roblox">Roblox</option>
              <option value="clash_royale">Clash Royale</option>
            </select>
          </label>
          <label>
            Username or player ID
            <input name="identifier" required maxLength={80} placeholder="Roblox username or Clash Royale tag" />
          </label>
          <button type="submit" className="btn">
            Request update
          </button>
        </form>
      </div>
    </main>
  );
}
