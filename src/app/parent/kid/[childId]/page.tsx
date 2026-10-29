import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import { sql } from "@/lib/db";
import { ensureHousehold } from "@/lib/ensure-household";
import { ensurePageLog } from "@/lib/page-log";
import { streakEndingToday } from "@/lib/check-unlocks";
import { removeKid, renameKid, setDailyGoal } from "../actions";

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
           b.title
    FROM rewards r
    LEFT JOIN books b ON b.id = r.book_id
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

  return (
    <main>
      <header className="top">
        <Link href="/parent">Back to parent</Link>
        <Link href={`/kid/${kid.id}`}>Open kid view</Link>
      </header>
      <h1>{kid.display_name}</h1>
      <form action={renameKid} className="inline-form">
        <input type="hidden" name="child_id" value={kid.id} />
        <label>
          Name
          <input name="display_name" required maxLength={40} defaultValue={kid.display_name} />
        </label>
        <button type="submit" className="btn">
          Rename
        </button>
      </form>
      <form action={setDailyGoal} className="inline-form">
        <input type="hidden" name="child_id" value={kid.id} />
        <label>
          Pages a day
          <input name="pages" type="number" min="1" step="1" defaultValue={goal} />
        </label>
        <button type="submit" className="btn">
          Save goal
        </button>
      </form>
      <p>Colored days met the goal.</p>

      {assignments.length > 0 && (
        <div className="card">
          <h2>Class</h2>
          {assignments.map((assignment) => {
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
              <div key={`${assignment.class_name}-${assignment.title}`} className="progress-row">
                <div className="progress-meta">
                  <span className={done ? "unlocked" : overdue ? "overdue" : ""}>
                    {assignment.class_name}: {assignment.title} · {assignment.book_title}
                    {due ? ` · ${due}` : ""}
                  </span>
                  <span>{done ? "done" : shown}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="card">
        <h2>{monthLabel}</h2>
        <div className="cal-head">
          {WEEKDAY.map((label) => (
            <div key={label}>{label}</div>
          ))}
        </div>
        <div className="cal">
          {cells.map((cell, i) => (
            <div
              key={cell.day ?? `pad-${i}`}
              className={cell.day && cell.pages >= goal ? "cal-day on" : "cal-day"}
            >
              {cell.day ? (
                <>
                  <span>{Number(cell.day.slice(8))}</span>
                  <small>{cell.pages || ""}</small>
                </>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>Rewards</h2>
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
              <div key={reward.id} className="progress-row">
                <div className="progress-meta">
                  <span className={unlocked ? "unlocked" : ""}>
                    {reward.face_value} for {criteriaLabel(reward.criteria_type, reward.pages, reward.title, reward.scope, reward.mode, reward.days)}
                  </span>
                  <span>
                    {unlocked
                      ? `unlocked ${reward.unlocked_at?.slice(0, 10) ?? ""}`
                      : `${shown} / ${target || "?"}`}
                  </span>
                </div>
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
        <h2>Books</h2>
        {progress.length === 0 ? (
          <p>No reading yet.</p>
        ) : (
          progress.map((p) => {
            const pct =
              p.total_locations > 0
                ? Math.min(100, Math.round((p.max_location / p.total_locations) * 100))
                : 0;
            const bookAssignments = assignments.filter((a) => a.book_id === p.book_id);
            return (
              <div key={p.book_id} className="progress-row">
                <div className="progress-meta">
                  <span>{p.title}</span>
                  <span>
                    {p.max_location} / {p.total_locations || "?"} · {pct}%
                  </span>
                </div>
                {bookAssignments.length > 0 && (
                  <div className="progress-meta">
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
                        <span
                          key={`${assignment.class_name}-${assignment.title}`}
                          className={done ? "unlocked" : overdue ? "overdue" : ""}
                        >
                          {assignment.class_name}
                          {due ? ` · ${due}` : ""}
                        </span>
                      );
                    })}
                  </div>
                )}
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="card">
        <h2>Remove</h2>
        <p>Removes this kid, their reading progress, and their rewards. Ledger history stays.</p>
        <form action={removeKid}>
          <input type="hidden" name="child_id" value={kid.id} />
          <button type="submit" className="btn secondary">
            Remove {kid.display_name}
          </button>
        </form>
      </div>
    </main>
  );
}
