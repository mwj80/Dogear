import Link from "next/link";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { ensureHousehold } from "@/lib/ensure-household";
import {
  createAssignment,
  createClass,
  enrollKid,
  removeAssignment,
  removeClass,
  removeEnrollment,
  renameClass,
  updateAssignment
} from "./actions";

const WEEKDAY = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function weekAroundToday() {
  const days: string[] = [];
  for (let i = -3; i <= 3; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
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

export default async function TeacherPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const user = await currentUser();
  const email =
    user?.primaryEmailAddress?.emailAddress ?? `${userId}@users.invalid`;
  const teacher = await ensureHousehold({ clerkUserId: userId, email });
  const db = sql();

  const todayRow = await db`SELECT CURRENT_DATE::text AS today`;
  const today = String((todayRow[0] as { today: string }).today);
  const days = weekAroundToday();

  const kids = (await db`
    SELECT id, display_name
    FROM children
    WHERE household_id = ${teacher.household_id}::uuid
    ORDER BY display_name
  `) as { id: string; display_name: string }[];
  const books = (await db`SELECT id, title FROM books ORDER BY title`) as {
    id: string;
    title: string;
  }[];
  const classes = (await db`
    SELECT id, name
    FROM classes
    WHERE teacher_user_id = ${teacher.user_id}::uuid
    ORDER BY created_at
  `) as { id: string; name: string }[];
  const enrollments = (await db`
    SELECT e.class_id::text AS class_id, c.id::text AS child_id, c.display_name
    FROM enrollments e
    JOIN classes cl ON cl.id = e.class_id
    JOIN children c ON c.id = e.child_id
    WHERE cl.teacher_user_id = ${teacher.user_id}::uuid
    ORDER BY c.display_name
  `) as { class_id: string; child_id: string; display_name: string }[];
  const assignments = (await db`
    SELECT a.id::text AS id, a.class_id::text AS class_id, a.title,
           a.criteria_type, (a.criteria_json->>'pages')::int AS pages,
           a.book_id::text AS book_id, b.title AS book_title,
           a.due_date::text AS due_date
    FROM assignments a
    JOIN classes cl ON cl.id = a.class_id
    JOIN books b ON b.id = a.book_id
    WHERE cl.teacher_user_id = ${teacher.user_id}::uuid
    ORDER BY a.due_date NULLS LAST, a.created_at
  `) as {
    id: string;
    class_id: string;
    title: string;
    criteria_type: string;
    pages: number | null;
    book_id: string;
    book_title: string;
    due_date: string | null;
  }[];
  const progress = (await db`
    SELECT p.child_id::text AS child_id, p.book_id::text AS book_id,
           p.max_location, p.total_locations
    FROM progress p
    JOIN children c ON c.id = p.child_id
    WHERE c.household_id = ${teacher.household_id}::uuid
  `) as {
    child_id: string;
    book_id: string;
    max_location: number;
    total_locations: number;
  }[];

  return (
    <main>
      <header className="top">
        <Link href="/parent">Back to parent</Link>
      </header>
      <h1>Teacher</h1>
      <p>Create a class, add kids from this household, and assign a book.</p>

      <div className="card">
        <h2>New class</h2>
        <form action={createClass} className="inline-form">
          <label>
            Name
            <input name="name" required maxLength={40} placeholder="Reading group" />
          </label>
          <button type="submit" className="btn">
            Create class
          </button>
        </form>
      </div>

      {classes.length === 0 ? (
        <div className="card">
          <p>No classes yet.</p>
        </div>
      ) : (
        classes.map((klass) => {
          const enrolled = enrollments.filter((e) => e.class_id === klass.id);
          const enrolledIds = new Set(enrolled.map((e) => e.child_id));
          const available = kids.filter((kid) => !enrolledIds.has(kid.id));
          const classAssignments = assignments.filter((a) => a.class_id === klass.id);
          let overdueCount = 0;
          let allDone = classAssignments.length > 0 && enrolled.length > 0;
          const dueByDay = new Map<string, "overdue" | "done" | "open">();
          for (const assignment of classAssignments) {
            let anyOverdue = false;
            let assignmentDone = enrolled.length > 0;
            for (const kid of enrolled) {
              const row = progress.find(
                (p) => p.child_id === kid.child_id && p.book_id === assignment.book_id
              );
              const max = Number(row?.max_location ?? 0);
              const total = Number(row?.total_locations ?? 0);
              const done =
                assignment.criteria_type === "finish_book"
                  ? total > 0 && max >= total - 1
                  : max >= Number(assignment.pages ?? 0);
              if (!done) {
                assignmentDone = false;
                allDone = false;
              }
              if (!done && assignment.due_date && assignment.due_date < today) {
                overdueCount += 1;
                anyOverdue = true;
              }
            }
            if (!assignment.due_date) continue;
            const status: "overdue" | "done" | "open" = anyOverdue
              ? "overdue"
              : assignmentDone
                ? "done"
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
          const classStatus: "overdue" | "done" | "open" =
            overdueCount > 0 ? "overdue" : allDone ? "done" : "open";
          return (
            <div key={klass.id} className="card">
              <h2 className={classStatus === "overdue" ? "overdue" : classStatus === "done" ? "unlocked" : ""}>
                {klass.name}
              </h2>
              <p className="muted">
                {enrolled.length} kids · {classAssignments.length} assignments
                {overdueCount > 0 && (
                  <span className="overdue"> · {overdueCount} overdue</span>
                )}
              </p>
              <div className="week">
                {days.map((day) => {
                  const label = WEEKDAY[new Date(day + "T12:00:00").getDay()];
                  const status = dueByDay.get(day);
                  const isToday = day === today;
                  return (
                    <div key={day} className={`day${isToday ? " today" : ""}`}>
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
              <form action={renameClass} className="inline-form">
                <input type="hidden" name="class_id" value={klass.id} />
                <label>
                  Name
                  <input name="name" required maxLength={40} defaultValue={klass.name} />
                </label>
                <button type="submit" className="btn">
                  Rename
                </button>
              </form>
              <form action={removeClass}>
                <input type="hidden" name="class_id" value={klass.id} />
                <button type="submit" className="btn secondary">
                  Remove class
                </button>
              </form>
              <p className="muted">{enrolled.length} kids</p>
              {enrolled.map((kid) => (
                <form key={kid.child_id} action={removeEnrollment} className="inline-form">
                  <input type="hidden" name="class_id" value={klass.id} />
                  <input type="hidden" name="child_id" value={kid.child_id} />
                  <span>{kid.display_name}</span>
                  <button type="submit" className="btn secondary">
                    Remove
                  </button>
                </form>
              ))}
              {available.length > 0 && (
                <form action={enrollKid} className="inline-form">
                  <input type="hidden" name="class_id" value={klass.id} />
                  <label>
                    Add kid
                    <select name="child_id" required>
                      {available.map((kid) => (
                        <option key={kid.id} value={kid.id}>
                          {kid.display_name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="submit" className="btn">
                    Add
                  </button>
                </form>
              )}

              <form action={createAssignment} className="stack">
                <input type="hidden" name="class_id" value={klass.id} />
                <label>
                  Assignment title
                  <input name="title" required maxLength={60} placeholder="Read Alice" />
                </label>
                <label>
                  Book
                  <select name="book_id" required>
                    {books.map((book) => (
                      <option key={book.id} value={book.id}>
                        {book.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Goal
                  <select name="goal" defaultValue="finish">
                    <option value="finish">Finish the book</option>
                    <option value="pages">Read N pages</option>
                  </select>
                </label>
                <label>
                  Pages, if page goal
                  <input name="pages" type="number" min="1" step="1" defaultValue="20" />
                </label>
                <label>
                  Due date
                  <input name="due_date" type="date" />
                </label>
                <button type="submit" className="btn">
                  Assign
                </button>
              </form>

              {classAssignments.map((assignment) => {
                let anyOverdue = false;
                let allDone = enrolled.length > 0;
                for (const kid of enrolled) {
                  const row = progress.find(
                    (p) => p.child_id === kid.child_id && p.book_id === assignment.book_id
                  );
                  const max = Number(row?.max_location ?? 0);
                  const total = Number(row?.total_locations ?? 0);
                  const done =
                    assignment.criteria_type === "finish_book"
                      ? total > 0 && max >= total - 1
                      : max >= Number(assignment.pages ?? 0);
                  if (!done) allDone = false;
                  if (!done && assignment.due_date && assignment.due_date < today) anyOverdue = true;
                }
                const status: "overdue" | "done" | "open" = anyOverdue
                  ? "overdue"
                  : allDone
                    ? "done"
                    : "open";
                const due = dueLabel(assignment.due_date, today, status === "done");
                return (
                  <div key={assignment.id} className="kid-block">
                    <p className={status === "overdue" ? "kid-name overdue" : status === "done" ? "kid-name unlocked" : "kid-name"}>
                      {klass.name}: {assignment.title}
                      {due ? ` · ${due}` : ""}
                    </p>
                    <form action={updateAssignment} className="stack">
                      <input type="hidden" name="assignment_id" value={assignment.id} />
                      <label>
                        Title
                        <input name="title" required maxLength={60} defaultValue={assignment.title} />
                      </label>
                      <label>
                        Book
                        <select name="book_id" defaultValue={assignment.book_id} required>
                          {books.map((book) => (
                            <option key={book.id} value={book.id}>
                              {book.title}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Goal
                        <select
                          name="goal"
                          defaultValue={assignment.criteria_type === "finish_book" ? "finish" : "pages"}
                        >
                          <option value="finish">Finish the book</option>
                          <option value="pages">Read N pages</option>
                        </select>
                      </label>
                      <label>
                        Pages, if page goal
                        <input
                          name="pages"
                          type="number"
                          min="1"
                          step="1"
                          defaultValue={assignment.pages ?? 20}
                        />
                      </label>
                      <label>
                        Due date
                        <input name="due_date" type="date" defaultValue={assignment.due_date ?? ""} />
                      </label>
                      <button type="submit" className="btn">
                        Save assignment
                      </button>
                    </form>
                    <form action={removeAssignment}>
                      <input type="hidden" name="assignment_id" value={assignment.id} />
                      <button type="submit" className="btn secondary">
                        Remove assignment
                      </button>
                    </form>
                    {enrolled.length === 0 ? (
                      <p className="muted">No kids enrolled yet.</p>
                    ) : (
                      enrolled.map((kid) => {
                        const row = progress.find(
                          (p) => p.child_id === kid.child_id && p.book_id === assignment.book_id
                        );
                        const max = Number(row?.max_location ?? 0);
                        const total = Number(row?.total_locations ?? 0);
                        const done =
                          assignment.criteria_type === "finish_book"
                            ? total > 0 && max >= total - 1
                            : max >= Number(assignment.pages ?? 0);
                        const overdue = !done && !!assignment.due_date && assignment.due_date < today;
                        const shown =
                          assignment.criteria_type === "finish_book"
                            ? `${max} / ${total || "?"}`
                            : `${Math.min(max, Number(assignment.pages ?? 0))} / ${assignment.pages}`;
                        const kidDue = dueLabel(assignment.due_date, today, done);
                        return (
                          <div key={kid.child_id} className="progress-row">
                            <div className="progress-meta">
                              <span className={done ? "unlocked" : overdue ? "overdue" : ""}>
                                {kid.display_name}
                                {kidDue ? ` · ${kidDue}` : ""}
                              </span>
                              <span>{done ? "done" : shown}</span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                );
              })}
            </div>
          );
        })
      )}
    </main>
  );
}
