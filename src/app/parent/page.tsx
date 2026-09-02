import { UserButton } from "@clerk/nextjs";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ensureHousehold } from "@/lib/ensure-household";
import { sql } from "@/lib/db";
import { createChild } from "./actions";

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
  let kids: { id: string; display_name: string }[] = [];
  let dbError: string | null = null;

  try {
    household = await ensureHousehold({ clerkUserId: userId, email });
    const rows = await sql()`
      SELECT id, display_name
      FROM children
      WHERE household_id = ${household.household_id}::uuid
      ORDER BY created_at
    `;
    kids = rows as { id: string; display_name: string }[];
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
      </div>

      {!dbError && (
        <div className="card">
          <h2>Kids</h2>
          {kids.length === 0 ? (
            <p>No kids yet.</p>
          ) : (
            <ul>
              {kids.map((kid) => (
                <li key={kid.id}>{kid.display_name}</li>
              ))}
            </ul>
          )}
          <form action={createChild} className="stack">
            <label>
              Name
              <input
                name="display_name"
                type="text"
                required
                maxLength={40}
                placeholder="Lucille"
              />
            </label>
            <button type="submit" className="btn">
              Add kid
            </button>
          </form>
        </div>
      )}
    </main>
  );
}
