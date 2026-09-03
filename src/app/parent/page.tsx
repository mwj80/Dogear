import { UserButton } from "@clerk/nextjs";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ensureHousehold } from "@/lib/ensure-household";
import { sql } from "@/lib/db";
import { createChild, createFinishReward, loadPot } from "./actions";

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
  let books: { id: string; title: string }[] = [];
  let rewards: {
    id: string;
    face_value: string;
    reward_type: string;
    status: string;
    cost_cents: number;
    display_name: string;
    title: string;
  }[] = [];
  let dbError: string | null = null;

  try {
    household = await ensureHousehold({ clerkUserId: userId, email });
    const db = sql();
    kids = (await db`
      SELECT id, display_name
      FROM children
      WHERE household_id = ${household.household_id}::uuid
      ORDER BY created_at
    `) as { id: string; display_name: string }[];
    books = (await db`
      SELECT id, title FROM books ORDER BY title
    `) as { id: string; title: string }[];
    rewards = (await db`
      SELECT r.id, r.face_value, r.reward_type, r.status, r.cost_cents,
             c.display_name, b.title
      FROM rewards r
      JOIN children c ON c.id = r.child_id
      JOIN books b ON b.id = r.book_id
      WHERE r.household_id = ${household.household_id}::uuid
      ORDER BY r.created_at DESC
    `) as typeof rewards;
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
            <p>Reward pot: ${potDollars}</p>
            <form action={loadPot} className="stack">
              <label>
                Load dollars
                <input name="dollars" type="number" min="1" step="1" defaultValue="10" />
              </label>
              <button type="submit" className="btn">
                Add to pot
              </button>
            </form>
          </>
        )}
      </div>

      {!dbError && (
        <>
          <div className="card">
            <h2>Kids</h2>
            {kids.length === 0 ? (
              <p>No kids yet.</p>
            ) : (
              <ul>
                {kids.map((kid) => (
                  <li key={kid.id}>
                    {kid.display_name}{" "}
                    <Link href={`/kid/${kid.id}`}>Open kid view</Link>
                  </li>
                ))}
              </ul>
            )}
            <form action={createChild} className="stack">
              <label>
                Name
                <input name="display_name" type="text" required maxLength={40} placeholder="Lucille" />
              </label>
              <button type="submit" className="btn">
                Add kid
              </button>
            </form>
          </div>

          <div className="card">
            <h2>Finish-book reward</h2>
            <form action={createFinishReward} className="stack">
              <label>
                Kid
                <select name="child_id" required>
                  {kids.map((kid) => (
                    <option key={kid.id} value={kid.id}>
                      {kid.display_name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Book
                <select name="book_id" required>
                  {books.map((book) => (
                    <option key={book.id} value={book.id}>
                      {book.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Type
                <select name="reward_type" defaultValue="robux">
                  <option value="robux">Roblox Robux</option>
                  <option value="gift_card">Gift card</option>
                  <option value="pizza">Pizza coupon</option>
                  <option value="custom">Custom</option>
                </select>
              </label>
              <label>
                Value the kid sees
                <input name="face_value" required placeholder="800 Robux" />
              </label>
              <button type="submit" className="btn">
                Save reward
              </button>
            </form>
            <p>Cost is calculated from admin rates (800 Robux → $6.00).</p>
          </div>

          <div className="card">
            <h2>Rewards</h2>
            {rewards.length === 0 ? (
              <p>None yet.</p>
            ) : (
              <ul>
                {rewards.map((reward) => (
                  <li key={reward.id}>
                    {reward.display_name}: {reward.face_value} for finishing{" "}
                    {reward.title} — {reward.status} ($
                    {(Number(reward.cost_cents) / 100).toFixed(2)})
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </main>
  );
}
