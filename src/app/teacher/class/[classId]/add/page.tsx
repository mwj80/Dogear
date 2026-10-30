import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import { sql } from "@/lib/db";
import { ensureHousehold } from "@/lib/ensure-household";
import { enrollKid } from "../../actions";

export default async function AddKidPage({
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

  const enrolled = (await db`
    SELECT child_id::text AS child_id
    FROM enrollments
    WHERE class_id = ${klass.id}::uuid
  `) as { child_id: string }[];
  const enrolledIds = new Set(enrolled.map((e) => e.child_id));

  const kids = (await db`
    SELECT id, display_name
    FROM children
    WHERE household_id = ${teacher.household_id}::uuid
    ORDER BY display_name
  `) as { id: string; display_name: string }[];
  const available = kids.filter((kid) => !enrolledIds.has(kid.id));

  return (
    <main>
      <header className="top">
        <Link href="/teacher">Back to teacher</Link>
      </header>
      <h1>Add kid to {klass.name}</h1>

      {available.length === 0 ? (
        <div className="card">
          <p>No kids available to add. Every kid in the household is already enrolled.</p>
        </div>
      ) : (
        <div className="card">
          <form action={enrollKid} className="stack">
            <input type="hidden" name="class_id" value={klass.id} />
            <label>
              Kid
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
        </div>
      )}
    </main>
  );
}
