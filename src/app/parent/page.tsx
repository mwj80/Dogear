import { UserButton } from "@clerk/nextjs";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ensureHousehold } from "@/lib/ensure-household";
import { sql } from "@/lib/db";
import { ensurePageLog } from "@/lib/page-log";
import { recheckHousehold } from "@/lib/check-unlocks";
import { resetDemo } from "./actions";
import { ensureSchema } from "@/lib/ensure-schema";
import CopyCode from "@/app/copy-code";


function decodeEscapes(s: string) {
  return s.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

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

export default async function ParentPage({
  searchParams
}: {
  searchParams: Promise<{ funds?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const params = await searchParams;
  const fundsAdded = Number(params.funds ?? 0);

  const user = await currentUser();
  const email =
    user?.primaryEmailAddress?.emailAddress ?? `${userId}@users.invalid`;

  let household: {
    household_id: string;
    pot_available_cents: number;
  } | null = null;
  let kids: { id: string; display_name: string; daily_goal_pages: number }[] = [];
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
  let recentUnlocks: { face_value: string; display_name: string; unlocked_at: string }[] = [];
  let releases: {
    id: string;
    display_name: string;
    provider: string;
    identifier: string;
    face_value: string;
    status: string;
    code: string | null;
  }[] = [];

  try {
    household = await ensureHousehold({ clerkUserId: userId, email });
    await ensurePageLog();
    await ensureSchema();
    await recheckHousehold(household.household_id);
    const db = sql();
    const todayRow = await db`SELECT CURRENT_DATE::text AS today`;
    dueToday = String((todayRow[0] as { today: string }).today);
    kids = (await db`
      SELECT id, display_name, daily_goal_pages, COALESCE(can_self_purchase, false) AS can_self_purchase
      FROM children
      WHERE household_id = ${household.household_id}::uuid
      ORDER BY created_at
    `) as { id: string; display_name: string; daily_goal_pages: number }[];
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
    recentUnlocks = (await db`
      SELECT r.face_value, c.display_name, r.unlocked_at::text AS unlocked_at
      FROM rewards r
      JOIN children c ON c.id = r.child_id
      WHERE r.household_id = ${household.household_id}::uuid
        AND r.status = 'unlocked'
        AND r.unlocked_at >= CURRENT_DATE - INTERVAL '7 days'
      ORDER BY r.unlocked_at DESC
      LIMIT 8
    `) as typeof recentUnlocks;
    releases = (await db`
      SELECT rr.id::text AS id, c.display_name, rr.provider, rr.identifier,
             rr.face_value, rr.status, rr.code
      FROM reward_releases rr
      JOIN children c ON c.id = rr.child_id
      WHERE c.household_id = ${household.household_id}::uuid
        AND rr.status IN ('pending', 'unmatched')
      ORDER BY rr.created_at DESC
    `) as typeof releases;
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

  return (
    <main>
      <header className="top">
        <Link href="/">✨ LitLoot</Link>
        <span>
          <Link href="/teacher">Teacher</Link>
          <Link href="/admin">Rates</Link>
          <UserButton />
        </span>
      </header>
      <h1>Parent dashboard</h1>
      <p>Signed in as {email}.</p>
      {fundsAdded > 0 && (
        <div className="card" style={{ borderColor: "#2e7d32" }}>
          <p className="unlocked">Added {money(fundsAdded)} to the available balance.</p>
        </div>
      )}
      {!dbError && releases.length > 0 && (
        <div className="card" style={{ borderColor: "#d32f2f" }}>
          <h2 style={{ textDecoration: "underline" }}>Reward releases</h2>
          <p className="muted">Copy the code to redeem.</p>
          <ul className="reward-list">
            {releases.map((release) => (
              <li key={release.id}>
                {release.display_name}
                {" · "}
                {decodeEscapes(release.face_value)}
                {" · "}
                {release.provider === "roblox" ? "Roblox" : release.provider === "clash_royale" ? "Clash Royale" : "Gift card"}
                {" · "}
                {release.status === "unmatched"
                  ? "no account saved"
                  : release.identifier}
                {release.code && (
                  <>
                    {" · "}
                    <CopyCode code={release.code} />
                  </>
                )}

              </li>
            ))}
          </ul>
        </div>
      )}
      {!dbError && recentUnlocks.length > 0 && (
        <div className="card" style={{ borderColor: "#2e7d32" }}>
          <p className="unlocked" style={{ margin: "0 0 0.35rem" }}>Recent unlocks</p>
          <ul className="reward-list">
            {recentUnlocks.map((item) => (
              <li key={`${item.display_name}-${item.unlocked_at}`} className="unlocked">
                {item.display_name} unlocked {decodeEscapes(item.face_value)}
                {" · "}
                {item.unlocked_at.slice(0, 10)}
              </li>
            ))}
          </ul>
        </div>
      )}

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
            <p>
              <Link href="/parent/funds">Add Funds</Link>
            </p>
          </>
        )}
      </div>

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
                let overdueCount = 0;
                let allDone = kidClasses.length > 0;
                for (const item of kidClasses) {
                  const max = Number(item.max_location);
                  const total = Number(item.total_locations);
                  const target = Number(item.pages ?? 0);
                  const done =
                    item.criteria_type === "finish_book"
                      ? total > 0 && max >= total - 1
                      : max >= target;
                  if (!done) allDone = false;
                  if (!done && item.due_date && item.due_date < dueToday) overdueCount += 1;
                  if (!item.due_date) continue;
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
                const kidStatus: "overdue" | "done" | "open" = overdueCount > 0
                  ? "overdue"
                  : allDone
                    ? "done"
                    : "open";
                const todayMet = todayPages >= goal;
                return (
                  <div key={kid.id} className="kid-block">
                    <p style={{ display: "flex", alignItems: "baseline", gap: "1rem", flexWrap: "wrap" }}>
                      <span className="kid-name">
                        {kid.display_name}
                      </span>
                      <Link href={`/parent/kid/${kid.id}`}>Progress</Link>
                      <Link href={`/kid/${kid.id}`}>Open kid view</Link>
                    </p>
                    <p className={todayMet ? "kid-meta unlocked" : "kid-meta muted"}>Today: {todayPages} pages · goal {goal}</p>
                    {kidClasses.length > 0 && (
                      <>
                        <p className="section-head">Classes</p>
                        {[...new Set(kidClasses.map((item) => item.class_name))].map((className) => {
                          const classItems = kidClasses.filter((item) => item.class_name === className);
                          let classOverdue = 0;
                          let classDone = classItems.length > 0;
                          for (const item of classItems) {
                            const max = Number(item.max_location);
                            const total = Number(item.total_locations);
                            const target = Number(item.pages ?? 0);
                            const done =
                              item.criteria_type === "finish_book"
                                ? total > 0 && max >= total - 1
                                : max >= target;
                            if (!done) classDone = false;
                            if (!done && item.due_date && item.due_date < dueToday) classOverdue += 1;
                          }
                          const classStatus: "overdue" | "done" | "open" =
                            classOverdue > 0 ? "overdue" : classDone ? "done" : "open";
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
                                {classItems.map((item) => {
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
                                      {item.title} · {item.book_title}
                                      {due ? ` · ${due}` : ""} — {done ? "done" : shown}
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          );
                        })}
                      </>
                    )}
                    {kidRewards.length > 0 && (
                      <>
                        <p className="section-head">Rewards</p>
                        <ul className="reward-list">
                          {kidRewards.map((reward) => (
                            <li
                              key={reward.id}
                              className={reward.status === "unlocked" ? "unlocked" : ""}
                            >
                              {decodeEscapes(reward.face_value)} for{" "}
                              {criteriaLabel(
                                reward.criteria_type,
                                reward.pages,
                                reward.title,
                                reward.scope,
                                reward.mode,
                                reward.days
                              )}{" "}
                              — {reward.status}
                              {Number(reward.shortfall_cents) > 0
                                ? ` (short ${money(Number(reward.shortfall_cents))})`
                                : ""}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                    <div className="week">
                      {days.map((day) => {
                        const pages = kidLog
                          .filter((l) => l.day === day)
                          .reduce((n, l) => n + Number(l.pages), 0);
                        const met = pages >= goal;
                        const isToday = day === dueToday;
                        const label = WEEKDAY[new Date(day + "T12:00:00").getDay()];
                        return (
                          <div key={day} className={`day${met ? " on" : ""}${isToday ? " today" : ""}`}>
                            <div className="dot">{pages || ""}</div>
                            <span>{label}</span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="legend">
                      <span><span className="swatch met"></span> goal met</span>
                      <span><span className="swatch overdue"></span> overdue</span>
                      <span><span className="swatch unlocked"></span> done</span>
                      <span><span className="swatch">•</span> open</span>
                    </div>
                    {kidProgress.length === 0 ? (
                      <p className="muted">No reading yet.</p>
                    ) : (
                      <>
                        <p className="section-head">Books</p>
                        <ul className="reward-list">
                          {kidProgress.map((p) => {
                            const pct =
                              p.total_locations > 0
                                ? Math.min(100, Math.round((p.max_location / p.total_locations) * 100))
                                : 0;
                            const bookAssignments = kidClasses.filter((a) => a.book_id === p.book_id);
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
                              if (!done && assignment.due_date && assignment.due_date < dueToday) anyOverdue = true;
                            }
                            const bookStatus: "overdue" | "done" | "open" = anyOverdue
                              ? "overdue"
                              : bookDone
                                ? "done"
                                : "open";
                            return (
                              <li
                                key={p.title}
                                className={bookStatus === "overdue" ? "overdue" : bookStatus === "done" ? "unlocked" : ""}
                              >
                                {p.title} — {p.max_location} / {p.total_locations || "?"} ({pct}%)
                              </li>
                            );
                          })}
                        </ul>
                      </>
                    )}
                  </div>
                );
              })
            )}
            <p>
              <Link href="/parent/kid/new">Family Administration</Link>
            </p>
          </div>

          <p style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", margin: "1rem 0" }}>
            <Link href="/parent/reward/new">Reward Administration</Link>
            <Link href="/parent/shop">Shop for Books</Link>
          </p>

        </>
      )}

      <form action={resetDemo} style={{ textAlign: "center", margin: "1.5rem 0 1rem" }}>
        <button type="submit" className="btn secondary">
          Reset demo
        </button>
        <p className="muted">
          Clears test data, resets each kid’s reader to the free titles, seeds public-domain books (some free, some 50¢), loads representative rewards, seeds a demo class, and sets balance to $40.
        </p>
      </form>
    </main>
  );
}

