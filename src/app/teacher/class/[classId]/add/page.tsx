import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import { sql } from "@/lib/db";
import { ensureHousehold } from "@/lib/ensure-household";
import { ensureSchema } from "@/lib/ensure-schema";
import { newClassCode } from "@/lib/class-code";
import { enrollKid, removeClass, removeEnrollment, renameClass } from "../../../actions";

export default async function ClassAdminPage({
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
  await ensureSchema();

  const classes = await db`
    SELECT id, name, code
    FROM classes
    WHERE id = ${classId}::uuid AND teacher_user_id = ${teacher.user_id}::uuid
    LIMIT 1
  `;
  if (!classes[0]) notFound();
  let klass = classes[0] as { id: string; name: string; code: string | null };
  if (!klass.code) {
    const code = newClassCode();
    await db`UPDATE classes SET code = ${code} WHERE id = ${klass.id}::uuid`;
    klass = { ...klass, code };
  }

  const enrolled = (await db`
    SELECT c.id::text AS child_id, c.display_name
    FROM enrollments e
    JOIN children c ON c.id = e.child_id
    WHERE e.class_id = ${klass.id}::uuid
    ORDER BY c.display_name
  `) as { child_id: string; display_name: string }[];
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
      <h1>Class Administration</h1>
      <p className="muted">{klass.name}</p>

      <div className="card">
        <h2>Class code</h2>
        <p>Give this code to a parent. They enter it on Family Administration to enroll a kid.</p>
        <p style={{ fontSize: "1.4rem", fontWeight: 700, letterSpacing: "0.15em", margin: "0.25rem 0" }}>
          {klass.code}
        </p>
      </div>

      <div className="card">
        <h2>Rename</h2>
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
      </div>

      <div className="card">
        <h2>Kids</h2>
        {enrolled.length === 0 ? (
          <p>No kids enrolled.</p>
        ) : (
          enrolled.map((kid) => (
            <form key={kid.child_id} action={removeEnrollment} className="inline-form">
              <input type="hidden" name="class_id" value={klass.id} />
              <input type="hidden" name="child_id" value={kid.child_id} />
              <span>{kid.display_name}</span>
              <button type="submit" className="btn secondary">
                Remove
              </button>
            </form>
          ))
        )}
      </div>

      <div className="card">
        <h2>Add kid from this household</h2>
        {available.length === 0 ? (
          <p>No kids available to add. Every kid in the household is already enrolled.</p>
        ) : (
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
        )}
      </div>

      <div className="card">
        <h2>Remove class</h2>
        <form action={removeClass}>
          <input type="hidden" name="class_id" value={klass.id} />
          <button type="submit" className="btn secondary">
            Remove class
          </button>
        </form>
      </div>
    </main>
  );
}
