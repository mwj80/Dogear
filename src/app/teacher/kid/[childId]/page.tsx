import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import { sql } from "@/lib/db";
import { ensureHousehold } from "@/lib/ensure-household";
import { ensurePageLog } from "@/lib/page-log";

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

function lastSevenDays() {
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

export default async function TeacherKidPage({
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
  const teacher = await ensureHousehold({ clerkUserId: userId, email });
  const db = sql();
  await ensurePageLog();

  const kids = await db`
    SELECT id, display_name, daily_goal_pages
    FROM children
    WHERE id = ${childId}::uuid AND household_id = ${teacher.household_id}::uuid
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
  const days = lastSevenDays();

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
      AND cl.teacher_user_id = ${teacher.user_id}::uuid
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

  const log = (await db`
    SELECT day::text AS day, SUM(pages)::int AS pages
    FROM page_log
    WHERE child_id = ${kid.id}::uuid
      AND day >= CURRENT_DATE - INTERVAL '6 days'
    GROUP BY day
  `) as { day: string; pages: number }[];
  const byDay = new Map(log.map((entry) => [entry.day, Number(entry.pages)]));
  const todayPages = byDay.get(today) ?? 0;

  let overdueCount = 0;
  let allDone = assignments.length > 0;
  const dueByDay = new Map<string, "overdue" | "done" | "open">();
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
  const todayMet = todayPages >= goal;

  return (
    <main>
      <header className="top">
        <Link href="/teacher">Back to teacher</Link>
      </header>
      <h1 className={kidStatus === "overdue" ? "overdue" : kidStatus === "done" ? "unlocked" : ""}>
        {kid.display_name}
      </h1>
      <p className={todayMet ? "unlocked" : "muted"}>
        Today: {todayPages} pages · goal {goal}
      </p>

      {assignments.length > 0 && (
        <div className="card">
          <h2>Assignments</h2>
          <p className="muted">
            {assignments.length} assignments{" · "}
            <span className={overdueCount > 0 ? "overdue" : "unlocked"}>
              {overdueCount} overdue
            </span>
          </p>
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
        <h2>This week</h2>
        <div className="week">
          {days.map((day) => {
            const pages = byDay.get(day) ?? 0;
            const label = WEEKDAY[new Date(day + "T12:00:00").getDay()];
            const status = dueByDay.get(day);
            const isToday = day === today;
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
      </div>
    </main>
  );
}
