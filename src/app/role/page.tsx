import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ensureUser } from "@/lib/ensure-user";
import { setRole } from "./actions";

export default async function RolePage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in?redirect_url=/role");
  const user = await currentUser();
  const email =
    user?.primaryEmailAddress?.emailAddress ?? `${userId}@users.invalid`;
  const u = await ensureUser({ clerkUserId: userId, email });

  return (
    <main>
      <header className="top">
        <div className="brand">
          <strong>✨ LitLoot</strong>
          <small>Choose your role</small>
        </div>
      </header>
      <h1>How will you use LitLoot?</h1>
      <p className="muted">
        You can change this later. Teachers who are also parents can use both.
      </p>
      <div className="card">
        <form action={setRole}>
          <input type="hidden" name="role" value="parent" />
          <button type="submit" className="btn" style={{ marginRight: "0.5rem" }}>
            I'm a parent
          </button>
        </form>
        <p className="muted">Fund rewards, manage kids, buy books.</p>
      </div>
      <div className="card">
        <form action={setRole}>
          <input type="hidden" name="role" value="teacher" />
          <button type="submit" className="btn" style={{ marginRight: "0.5rem" }}>
            I'm a teacher
          </button>
        </form>
        <p className="muted">Create classes, give a join code, assign books.</p>
      </div>
      <div className="card">
        <form action={setRole}>
          <input type="hidden" name="role" value="both" />
          <button type="submit" className="btn">
            I'm both
          </button>
        </form>
        <p className="muted">Parent dashboard plus teacher tools.</p>
      </div>
      {u.is_parent || u.is_teacher ? (
        <p className="muted">
          Current: {u.is_parent ? "parent" : ""}
          {u.is_parent && u.is_teacher ? " + " : ""}
          {u.is_teacher ? "teacher" : ""}
        </p>
      ) : null}
    </main>
  );
}
