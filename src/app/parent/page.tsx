import { UserButton } from "@clerk/nextjs";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ensureHousehold } from "@/lib/ensure-household";
import { sql } from "@/lib/db";
import { ensurePageLog } from "@/lib/page-log";
import { recheckHousehold } from "@/lib/check-unlocks";
import { createChild, loadPot, resetDemo } from "./actions";
import RewardForm from "./reward-form";
import RewardEditor from "./reward-editor";

function lastSevenDays() {
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

const WEEKDAY = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

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
  const read = mode === "read" || scope === "any";
  if (scope === "any") {
    return pages ? `reading ${pages} pages in any book` : "reading pages in any book";
  }
  if (type === "finish_book") return `finishing ${title}`;
  if (read && pages) return `reading ${pages} pages in ${title}`;
  if (pages) return `reaching page ${pages} in ${title}`;
  return `finishing ${title}`;
}

export default async function ParentPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const user = await currentUser();
  const email =
    user?.primaryEmailAddress?.emailAddress ?? `${userId}@users.invalid`;

  let household: {
    household_id: string;
    pot_available_cents: number;
  } | null = null;
  let kids: { id: string; display_name: string; daily_goal_pages: number }[] = [];
  let books: { id: string; title: string }[] = [];
  let rewards: {
    id: string;
    face_value: string;
    reward_type: string;
    status: string;
    cost_cents: number;
    shortfall_cents: number;
    display_name: string;
    title: string | null;
    child_id: string;
    criteria_type: string;
    scope: string;
    pages: number | null;
    days: number | null;
    mode: string | null;
  }[] = [];
  let progress: {
    child_id: string;
    book_id: string;
    title: string;
    max_location: number;
    total_locations: number;
    updated_at: string;
  }[] = [];
  let log: { child_id: string; day: string; pages: number }[] = [];
  let classes: {
    child_id: string;
    class_name: string;
    title: string;
    book_id: string;
    book_title: string;
    criteria_type: string;
    pages: number | null;
    due_date: string | null;
    max_location: number;
    total_locations: number;
  }[] = [];
  let dueToday = new Date().toISOString().slice(0, 10);
  let dbError: string | null = null;

  try {
    household = await ensureHousehold({ clerkUserId: userId, email });
    await ensurePageLog();
    await recheckHousehold(household.household_id);
    const db = sql();
    const todayRow = await db`SELECT CURRENT_DATE::text AS today`;
    dueToday = String((todayRow[0] as { today: string }).today);
    kids = (await db`
      SELECT id, display_name, daily_goal_pages
      FROM children
      WHERE household_id = ${household.household_id}::uuid
      ORDER BY created_at
    `) as { id: string; display_name: string; daily_goal_pages: number }[];
    books = (await db`
      SELECT id, title FROM books ORDER BY title
    `) as { id: string; title: string }[];
    rewards = (await db`
      SELECT r.id, r.face_value, r.reward_type, r.status, r.cost_cents,
             r.shortfall_cents, r.child_id, r.criteria_type, r.scope,
             (r.criteria_json->>'pages')::int AS pages,
             (r.criteria_json->>'days')::int AS days,
             r.criteria_json->>'mode' AS mode,
             c.display_name, b.title
      FROM rewards r
      JOIN children c ON c.id = r.child_id
      LEFT JOIN books b ON b.id = r.book_id
      WHERE r.household_id = ${household.household_id}::uuid
      ORDER BY r.created_at DESC
    `) as typeof rewards;
    progress = (await db`
      SELECT p.child_id, p.book_id::text AS book_id, b.title,
             p.max_location, p.total_locations, p.updated_at
      FROM progress p
      JOIN children c ON c.id = p.child_id
      JOIN books b ON b.id = p.book_id
      WHERE c.household_id = ${household.household_id}::uuid
      ORDER BY p.updated_at DESC
    `) as typeof progress;
    log = (await db`
      SELECT pl.child_id, pl.day::text AS day, SUM(pl.pages)::int AS pages
      FROM page_log pl
      JOIN children c ON c.id = pl.child_id
      WHERE c.household_id = ${household.household_id}::uuid
        AND pl.day >= CURRENT_DATE - INTERVAL '6 days'
      GROUP BY pl.child_id, pl.day
    `) as typeof log;
    classes = (await db`
      SELECT e.child_id::text AS child_id, cl.name AS class_name, a.title,
             a.book_id::text AS book_id,
             b.title AS book_title, a.criteria_type,
             (a.criteria_json->>'pages')::int AS pages,
             a.due_date::text AS due_date,
             COALESCE(p.max_location, 0) AS max_location,
             COALESCE(p.total_locations, 0) AS total_locations
      FROM enrollments e
      JOIN classes cl ON cl.id = e.class_id
      JOIN children c ON c.id = e.child_id
      JOIN assignments a ON a.class_id = cl.id
      JOIN books b ON b.id = a.book_id
      LEFT JOIN progress p ON p.child_id = e.child_id AND p.book_id = a.book_id
      WHERE c.household_id = ${household.household_id}::uuid
      ORDER BY a.due_date NULLS LAST, a.created_at
    `) as typeof classes;
  } catch (err) {
    dbError = err instanceof Error ? err.message : "Database error";
  }

  const availableCents = household ? Number(household.pot_available_cents) : 0;
  const allocatedCents = rewards
    .filter((r) => r.status === "active")
    .reduce((n, r) => n + Number(r.cost_cents), 0);
  const remainingCents = availableCents - allocatedCents;
  const overdrawn = remainingCents < 0;
  const days = lastSevenDays();
  const classNames = [...new Set(classes.map((item) => item.class_name))];
  const classSummaries = classNames.map((name) => {
    const rows = classes.filter((item) => item.class_name === name);
    const kidsInClass = new Set(rows.map((item) => item.child_id));
    const assignmentTitles = new Set(rows.map((item) => item.title));
    let overdueCount = 0;
    let allDone = rows.length > 0;
    for (const item of rows) {
      const max = Number(item.max_location);
      const total = Number(item.total_locations);
      const target = Number(item.pages ?? 0);
      const done =
        item.criteria_type === "finish_book"
          ? total > 0 && max >= total - 1
          : max >= target;
      if (!done) allDone = false;
      if (!done && item.due_date && item.due_date < dueToday) overdueCount += 1;
    }
    const status: "overdue" | "done" | "open" =
      overdueCount > 0 ? "overdue" : allDone ? "done" : "open";
    return {
      name,
      kids: kidsInClass.size,
      assignments: assignmentTitles.size,
      overdue: overdueCount,
      status
    };
  });

  return (
    <main>
      <header className="top">
        <Link href="/">DogEar</Link>
        <span>
          <Link href="/teacher">Teacher</Link>
          <Link href="/admin">Rates</Link>
          <UserButton />
        </span>
      </header>
      <h1>Parent dashboard</h1>
      <p>Signed in as {email}.</p>

      <div className="card">
        {dbError ? (
          <p>Could not reach the database: {dbError}</p>
        ) : (
          <>
            <div className="balance-strip">
              <div>
                <span>Available balance</span>
                <strong>{money(availableCents)}</strong>
              </div>
              <div>
                <span>Allocated</span>
                <strong>{money(allocatedCents)}</strong>
              </div>
              <div>
                <span>Remaining</span>
                <strong>{money(remainingCents)}</strong>
              </div>
            </div>
            {overdrawn && (
              <div className="warning">
                Active rewards are allocated {money(Math.abs(remainingCents))} more than the available balance. Add funds, or a reward may unlock short.
              </div>
            )}
            <form action={loadPot} className="stack">
              <label>
                Add dollars
                <input name="dollars" type="number" min="1" step="1" defaultValue="10" />
              </label>
              <button type="submit" className="btn">
                Add to balance
              </button>
            </form>
            <form action={resetDemo} className="stack">
              <button type="submit" className="btn secondary">
                Reset demo
              </button>
              <p className="muted">
                Clears test rewards and loads one of each type per kid. Progress to page 5, 5 pages on the last two days in the first book, balance to $40.
              </p>
            </form>
          </>
        )}
      </div>

      {!dbError && classSummaries.length > 0 && (
        <div className="card">
          <h2>Classes</h2>
          {classSummaries.map((summary) => (
            <div key={summary.name} className="kid-block">
              <p
                className={
                  summary.status === "overdue"
                    ? "kid-name overdue"
                    : summary.status === "done"
                      ? "kid-name unlocked"
                      : "kid-name"
                }
              >
                {summary.name}
              </p>
              <p className="muted">
                {summary.kids} kids · {summary.assignments} assignments
                {summary.overdue > 0 && (
                  <span className="overdue"> · {summary.overdue} overdue</span>
                )}
              </p>
            </div>
          ))}
        </div>
      )}

      {!dbError && (
        <>
          <div className="card">
            <h2>Kids</h2>
            {kids.length === 0 ? (
              <p>No kids yet.</p>
            ) : (
              kids.map((kid) => {
                const kidProgress = progress.filter((p) => p.child_id === kid.id);
                const kidRewards = rewards.filter((r) => r.child_id === kid.id);
                const kidLog = log.filter((l) => l.child_id === kid.id);
                const kidClasses = classes.filter((c) => c.child_id === kid.id);
                const today = days[days.length - 1];
                const goal = Number(kid.daily_goal_pages) || 5;
                const todayPages = kidLog
                  .filter((l) => l.day === today)
                  .reduce((n, l) => n + Number(l.pages), 0);
                const dueByDay = new Map<string, "overdue" | "done" | "open">();
                for (const item of kidClasses) {
                  if (!item.due_date) continue;
                  const max = Number(item.max_location);
                  const total = Number(item.total_locations);
                  const target = Number(item.pages ?? 0);
                  const done =
                    item.criteria_type === "finish_book"
                      ? total > 0 && max >= total - 1
                      : max >= target;
                  const status: "overdue" | "done" | "open" = done
                    ? "done"
                    : item.due_date < dueToday
                      ? "overdue"
                      : "open";
                  const existing = dueByDay.get(item.due_date);
                  const next =
                    existing === "overdue" || status === "overdue"
                      ? "overdue"
                      : existing === "done" && status === "done"
                        ? "done"
                        : status === "done" && !existing
                          ? "done"
                          : "open";
                  dueByDay.set(item.due_date, next);
                }
                return (
                  <div key={kid.id} className="kid-block">
                    <p className="kid-name">
                      {kid.display_name}{" "}
                      <Link href={`/parent/kid/${kid.id}`}>Progress</Link>{" "}
                      <Link href={`/kid/${kid.id}`}>Open kid view</Link>
                    </p>
                    <p className="muted">Today: {todayPages} pages · goal {goal}</p>
                    {kidClasses.length > 0 && (
                      <ul className="reward-list">
                        {kidClasses.map((item) => {
                          const max = Number(item.max_location);
                          const total = Number(item.total_locations);
                          const target = Number(item.pages ?? 0);
                          const done =
                            item.criteria_type === "finish_book"
                              ? total > 0 && max >= total - 1
                              : max >= target;
                          const overdue = !done && !!item.due_date && item.due_date < dueToday;
                          const shown =
                            item.criteria_type === "finish_book"
                              ? `${max} / ${total || "?"}`
                              : `${Math.min(max, target)} / ${target}`;
                          const due = dueLabel(item.due_date, dueToday, done);
                          return (
                            <li
                              key={`${item.class_name}-${item.title}`}
                              className={done ? "unlocked" : overdue ? "overdue" : ""}
                            >
                              {item.class_name}: {item.title} · {item.book_title}
                              {due ? ` · ${due}` : ""} — {done ? "done" : shown}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    <div className="week">
                      {days.map((day) => {
                        const pages = kidLog
                          .filter((l) => l.day === day)
                          .reduce((n, l) => n + Number(l.pages), 0);
                        const label = WEEKDAY[new Date(day + "T12:00:00").getDay()];
                        const status = dueByDay.get(day);
                        const isToday = day === dueToday;
                        return (
                          <div key={day} className={`day${pages >= goal ? " on" : ""}${isToday ? " today" : ""}`}>
                            <div className="dot">{pages > 0 ? pages : ""}</div>
                            {label}
                            {status && (
                              <small className={status === "overdue" ? "overdue" : status === "done" ? "unlocked" : ""}>
                                •
                              </small>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <div className="legend">
                      <span><span className="swatch unlocked">•</span> finished</span>
                      <span><span className="swatch overdue">•</span> overdue</span>
                      <span><span className="swatch">•</span> open</span>
                    </div>
                    {kidProgress.length === 0 ? (
                      <p className="muted">No reading yet.</p>
                    ) : (
                      kidProgress.map((p) => {
                        const pct =
                          p.total_locations > 0
                            ? Math.min(100, Math.round((p.max_location / p.total_locations) * 100))
                            : 0;
                        const bookAssignments = kidClasses.filter((a) => a.book_id === p.book_id);
                        let anyOverdue = false;
                        let allDone = bookAssignments.length > 0;
                        for (const assignment of bookAssignments) {
                          const max = Number(assignment.max_location);
                          const total = Number(assignment.total_locations);
                          const target = Number(assignment.pages ?? 0);
                          const done =
                            assignment.criteria_type === "finish_book"
                              ? total > 0 && max >= total - 1
                              : max >= target;
                          if (!done) allDone = false;
                          if (!done && assignment.due_date && assignment.due_date < dueToday) anyOverdue = true;
                        }
                        const bookStatus: "overdue" | "done" | "open" = anyOverdue
                          ? "overdue"
                          : allDone
                            ? "done"
                            : "open";
                        return (
                          <div key={p.title} className="progress-row">
                            <div className="progress-meta">
                              <span className={bookStatus === "overdue" ? "overdue" : bookStatus === "done" ? "unlocked" : ""}>
                                {p.title}
                              </span>
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
                                  const overdue =
                                    !done && !!assignment.due_date && assignment.due_date < dueToday;
                                  const due = dueLabel(assignment.due_date, dueToday, done);
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
                    {kidRewards.length > 0 && (
                      <ul className="reward-list">
                        {kidRewards.map((r) => (
                          <li key={r.id} className={r.status === "unlocked" ? "unlocked" : ""}>
                            {r.face_value} for {criteriaLabel(r.criteria_type, r.pages, r.title, r.scope, r.mode, r.days)} — {r.status}
                            {Number(r.shortfall_cents) > 0 ? ` (short ${money(Number(r.shortfall_cents))})` : ""}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })
            )}
            <form action={createChild} className="stack">
              <label>
                Name
                <input name="display_name" type="text" required maxLength={40} placeholder="Lucille" />
              </label>
              <button type="submit" className="btn">
                Add kid
              </button>
            </form>
          </div>

          <div className="card">
            <h2>Reward</h2>
            <RewardForm kids={kids} books={books} />
          </div>

          <div className="card">
            <h2>All rewards</h2>
            {rewards.length === 0 ? (
              <p>None yet.</p>
            ) : (
              rewards.map((reward) => (
                <div key={reward.id} className="reward-item">
                  <div className={reward.status === "unlocked" ? "unlocked" : ""}>
                    {reward.display_name}: {reward.face_value} for{" "}
                    {criteriaLabel(reward.criteria_type, reward.pages, reward.title, reward.scope, reward.mode, reward.days)} — {reward.status} (
                    {money(Number(reward.cost_cents))} from balance)
                    {Number(reward.shortfall_cents) > 0
                      ? ` — short ${money(Number(reward.shortfall_cents))}`
                      : ""}
                  </div>
                  <RewardEditor reward={reward} />
                </div>
              ))
            )}
          </div>
        </>
      )}
    </main>
  );
}
