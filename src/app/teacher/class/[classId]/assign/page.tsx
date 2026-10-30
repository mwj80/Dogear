import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import { sql } from "@/lib/db";
import { ensureHousehold } from "@/lib/ensure-household";
import { AssignForm } from "./form";

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
        <AssignForm classId={klass.id} books={books} />
      </div>
    </main>
  );
}
