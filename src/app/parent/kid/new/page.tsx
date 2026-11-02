import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { createChild } from "../../actions";

export default async function NewKidPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  return (
    <main>
      <header className="top">
        <Link href="/parent">Back to parent</Link>
      </header>
      <h1>Add kid</h1>

      <div className="card">
        <form action={createChild} className="stack">
          <label>
            Name
            <input name="display_name" type="text" required maxLength={40} />
          </label>
          <button type="submit" className="btn">
            Add kid
          </button>
        </form>
      </div>
    </main>
  );
}
