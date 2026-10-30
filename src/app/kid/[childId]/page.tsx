import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "@/lib/db";

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

export default async function KidHomePage({
  params
}: {
  params: Promise<{ childId: string }>;
}) {
  const { childId } = await params;
  const db = sql();

  const kids = await db`
    SELECT id, display_name FROM children WHERE id = ${childId}::uuid LIMIT 1
  `;
  if (!kids[0]) notFound();

  const todayRow = await db`SELECT CURRENT_DATE::text AS today`;
  const today = String((todayRow[0] as { today: string }).today);

  const books = await db`
    SELECT slug, title, author FROM books ORDER BY title
  `;
  const rewards = await db`
    SELECT r.face_value, r.status, r.criteria_type, r.scope,
           (r.criteria_json->>'pages')::int AS pages,
           (r.criteria_json->>'days')::int AS days,
           r.criteria_json->>'mode' AS mode,
           b.title, b.slug
    FROM rewards r
    LEFT JOIN books b ON b.id = r.book_id
    WHERE r.child_id = ${childId}::uuid
    ORDER BY r.created_at DESC
  `;
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

  const kid = kids[0] as { id: string; display_name: string };
  const classNames = [...new Set(assignments.map((a) => a.class_name))];
  const classStatuses = classNames.map((name) => {
    const rows = assignments.filter((a) => a.class_name === name);
    let overdueCount = 0;
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
      if (!done && assignment.due_date && assignment.due_date < today) overdueCount += 1;
    }
    const status: "overdue" | "done" | "open" = overdueCount > 0
      ? "overdue"
      : allDone
        ? "done"
        : "open";
    return { name, status, overdue: overdueCount, assignments: rows.length };
  });

  return (
    <main>
      <header className="top">
        <Link href="/parent">Back to parent</Link>
      </header>
      <h1>Hi, {kid.display_name}</h1>
      <p>Pick a book and earn your rewards.</p>
      {assignments.length > 0 && (
        <div className="card">
          <h2>Assigned</h2>
          {classStatuses.map((klass) => (
            <div key={klass.name} className="kid-block">
              <p
                className={
                  klass.status === "overdue"
                    ? "kid-name overdue"
                    : klass.status === "done"
                      ? "kid-name unlocked"
                      : "kid-name"
                }
              >
                {klass.name}
              </p>
              <p className="muted">
                {klass.assignments} assignments{" · "}
                <span className={klass.overdue > 0 ? "overdue" : "unlocked"}>
                  {klass.overdue} overdue
                </span>
              </p>
            </div>
          ))}
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
            const goal =
              assignment.criteria_type === "finish_book"
                ? `Finish ${assignment.book_title}`
                : `Read ${target} pages in ${assignment.book_title}`;
            const due = dueLabel(assignment.due_date, today, done);
            return (
              <div key={`${assignment.slug}-${assignment.title}`} className="progress-row">
                <div className="progress-meta">
                  <span className={done ? "unlocked" : overdue ? "overdue" : ""}>
                    {assignment.class_name}:{" "}
                    <Link href={`/kid/${kid.id}/book/${assignment.slug}`}>{assignment.title}</Link>
                    {" "}· {goal}
                    {due ? ` · ${due}` : ""}
                  </span>
                  <span className={done ? "unlocked" : overdue ? "overdue" : ""}>
                    {done ? "done" : shown}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="card">
        <h2>Rewards</h2>
        {rewards.length === 0 ? (
          <p>No rewards yet.</p>
        ) : (
          <ul>
            {rewards.map((reward, i) => {
              const r = reward as {
                face_value: string;
                status: string;
                title: string | null;
                slug: string | null;
                criteria_type: string;
                scope: string;
                pages: number | null;
                days: number | null;
                mode: string | null;
              };
              const goal =
                r.criteria_type === "daily_streak"
                  ? `Read ${r.pages} pages a day for ${r.days} days${
                      r.scope === "any" ? " in any book" : ` in ${r.title}`
                    }`
                  : r.scope === "any"
                    ? `Read ${r.pages ?? 0} pages in any book`
                    : r.criteria_type === "finish_book"
                      ? `Finish ${r.title}`
                      : r.mode === "read"
                        ? `Read ${r.pages} pages in ${r.title}`
                        : `Reach page ${r.pages} in ${r.title}`;
              return (
                <li key={`${r.slug ?? "any"}-${i}`}>
                  {goal} → {r.face_value} ({r.status})
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="card">
        <h2>Library</h2>
        <ul>
          {books.map((book) => {
            const b = book as { slug: string; title: string; author: string };
            const bookAssignments = assignments.filter((a) => a.slug === b.slug);
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
              if (!done && assignment.due_date && assignment.due_date < today) anyOverdue = true;
            }
            const status: "overdue" | "done" | "open" = anyOverdue
              ? "overdue"
              : allDone
                ? "done"
                : "open";
            return (
              <li key={b.slug}>
                <Link
                  href={`/kid/${kid.id}/book/${b.slug}`}
                  className={status === "overdue" ? "overdue" : status === "done" ? "unlocked" : ""}
                >
                  {b.title}
                </Link>
                <span> — {b.author}</span>
                {bookAssignments.length > 0 && (
                  <span>
                    {" — "}
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
      </div>
    </main>
  );
}
