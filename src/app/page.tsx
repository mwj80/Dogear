import { UserButton } from "@clerk/nextjs";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function ParentPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const user = await currentUser();

  return (
    <main>
      <header className="top">
        <Link href="/">DogEar</Link>
        <UserButton />
      </header>
      <h1>Parent dashboard</h1>
      <p>
        Signed in as {user?.primaryEmailAddress?.emailAddress ?? "parent"}.
      </p>
      <div className="card">
        <p>
          Accounts work. Next: create a household + child in Neon when you add
          a kid (P1-2b).
        </p>
        <p>Pot, rewards, and reader are not wired yet.</p>
      </div>
    </main>
  );
}
