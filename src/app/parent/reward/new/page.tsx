import Link from "next/link";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ensureHousehold } from "@/lib/ensure-household";
import { sql } from "@/lib/db";
import RewardForm from "../../reward-form";

export default async function NewRewardPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const user = await currentUser();
  const email =
    user?.primaryEmailAddress?.emailAddress ?? `${userId}@users.invalid`;
  const household = await ensureHousehold({ clerkUserId: userId, email });
  const db = sql();

  const kids = (await db`
    SELECT id, display_name
    FROM children
    WHERE household_id = ${household.household_id}::uuid
    ORDER BY display_name
  `) as { id: string; display_name: string }[];
  const books = (await db`SELECT id, title FROM books ORDER BY title`) as {
    id: string;
    title: string;
  }[];

  return (
    <main>
      <header className="top">
        <Link href="/parent">Back to parent</Link>
      </header>
      <h1>Set a reward</h1>

      {kids.length === 0 ? (
        <div className="card">
          <p>Add a kid first.</p>
        </div>
      ) : (
        <div className="card">
          <RewardForm kids={kids} books={books} />
        </div>
      )}
    </main>
  );
}
