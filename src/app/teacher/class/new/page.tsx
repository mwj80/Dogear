import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { createClass } from "../../actions";

export default async function NewClassPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  return (
    <main>
      <header className="top">
        <Link href="/teacher">Back to teacher</Link>
      </header>
      <h1>New class</h1>

      <div className="card">
        <form action={createClass} className="stack">
          <label>
            Name
            <input name="name" required maxLength={40} placeholder="Reading group" />
          </label>
          <button type="submit" className="btn">
            Create class
          </button>
        </form>
      </div>
    </main>
  );
}
