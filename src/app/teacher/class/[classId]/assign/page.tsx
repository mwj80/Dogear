import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import { sql } from "@/lib/db";
import { ensureHousehold } from "@/lib/ensure-household";
import { createAssignment } from "../../../actions";

export default async function AssignPage({
  params
}: {
  params: Promise<{ classId: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const { classId } = await params;
  const user = await currentUser();
  const email =
    user?.primaryEmailAddress?.emailAddress ?? `${userId}@users.invalid`;
  const teacher = await ensureHousehold({ clerkUserId: userId, email });
  const db = sql();

  const classes = await db`
    SELECT id, name
    FROM classes
    WHERE id = ${classId}::uuid AND teacher_user_id = ${teacher.user_id}::uuid
    LIMIT 1
  `;
  if (!classes[0]) notFound();
  const klass = classes[0] as { id: string; name: string };

  const books = (await db`SELECT id, title FROM books ORDER BY title`) as {
    id: string;
    title: string;
  }[];

  return (
    <main>
      <header className="top">
        <Link href="/teacher">Back to teacher</Link>
      </header>
      <h1>Assign to {klass.name}</h1>

      <div className="card">
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
      </div>
    </main>
  );
}
