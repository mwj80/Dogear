import { UserButton } from "@clerk/nextjs";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ensureHousehold } from "@/lib/ensure-household";

export default async function ParentPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const user = await currentUser();
  const email =
    user?.primaryEmailAddress?.emailAddress ?? `${userId}@users.invalid`;

  let household: {
    household_id: string;
    pot_available_cents: number;
  } | null = null;
  let dbError: string | null = null;

  try {
    household = await ensureHousehold({ clerkUserId: userId, email });
  } catch (err) {
    dbError = err instanceof Error ? err.message : "Database error";
  }

  const potDollars = household
    ? (household.pot_available_cents / 100).toFixed(2)
    : "—";

  return (
    <main>
      <header className="top">
        <Link href="/">DogEar</Link>
        <UserButton />
      </header>
      <h1>Parent dashboard</h1>
      <p>Signed in as {email}.</p>
      <div className="card">
        {dbError ? (
          <p>Could not reach the database: {dbError}</p>
        ) : (
          <>
            <p>Household is set up in Neon.</p>
            <p>Reward pot: ${potDollars}</p>
          </>
        )}
        <p>Next: add a child profile, then the reader.</p>
      </div>
    </main>
  );
}
