import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import { sql } from "@/lib/db";
import { ensureHousehold } from "@/lib/ensure-household";
import { EditForm } from "./form";

export default async function EditAssignmentPage({
  params
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const { assignmentId } = await params;
  const user = await currentUser();
  const email =
    user?.primaryEmailAddress?.emailAddress ?? `${userId}@users.invalid`;
  const teacher = await ensureHousehold({ clerkUserId: userId, email });
  const db = sql();

  const rows = await db`
    SELECT a.id::text AS id, a.title, a.criteria_type,
           (a.criteria_json->>'pages')::int AS pages,
           a.book_id::text AS book_id, a.due_date::text AS due_date,
           cl.name AS class_name
    FROM assignments a
    JOIN classes cl ON cl.id = a.class_id
    WHERE a.id = ${assignmentId}::uuid
      AND cl.teacher_user_id = ${teacher.user_id}::uuid
    LIMIT 1
  `;
  if (!rows[0]) notFound();
  const assignment = rows[0] as {
    id: string;
    title: string;
    criteria_type: string;
    pages: number | null;
    book_id: string;
    due_date: string | null;
    class_name: string;
  };

  const books = (await db`SELECT id, title FROM books ORDER BY title`) as {
    id: string;
    title: string;
  }[];

  return (
    <main>
      <header className="top">
        <Link href="/teacher">Back to teacher</Link>
      </header>
      <h1>Edit {assignment.title}</h1>
      <p className="muted">{assignment.class_name}</p>

      <div className="card">
        <EditForm assignment={assignment} books={books} />
      </div>
    </main>
  );
}
