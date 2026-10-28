import Link from "next/link";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { ensureHousehold } from "@/lib/ensure-household";
import { createAssignment, createClass, enrollKid, removeAssignment } from "./actions";

export default async function TeacherPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const user = await currentUser();
  const email =
    user?.primaryEmailAddress?.emailAddress ?? `${userId}@users.invalid`;
  const teacher = await ensureHousehold({ clerkUserId: userId, email });
  const db = sql();

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
           a.book_id::text AS book_id, b.title AS book_title
    FROM assignments a
    JOIN classes cl ON cl.id = a.class_id
    JOIN books b ON b.id = a.book_id
    WHERE cl.teacher_user_id = ${teacher.user_id}::uuid
    ORDER BY a.created_at
  `) as {
    id: string;
    class_id: string;
    title: string;
    criteria_type: string;
    pages: number | null;
    book_id: string;
    book_title: string;
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
          return (
            <div key={klass.id} className="card">
              <h2>{klass.name}</h2>
              <p className="muted">{enrolled.length} kids</p>
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
                <button type="submit" className="btn">
                  Assign
                </button>
              </form>

              {classAssignments.map((assignment) => (
                <div key={assignment.id} className="kid-block">
                  <p className="kid-name">
                    {assignment.title} · {assignment.book_title}
                  </p>
                  <p className="muted">
                    {assignment.criteria_type === "finish_book"
                      ? "Finish the book"
                      : `Read ${assignment.pages} pages`}
                  </p>
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
                      const shown =
                        assignment.criteria_type === "finish_book"
                          ? `${max} / ${total || "?"}`
                          : `${Math.min(max, Number(assignment.pages ?? 0))} / ${assignment.pages}`;
                      return (
                        <div key={kid.child_id} className="progress-row">
                          <div className="progress-meta">
                            <span className={done ? "unlocked" : ""}>{kid.display_name}</span>
                            <span>{done ? "done" : shown}</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              ))}
            </div>
          );
        })
      )}
    </main>
  );
}
