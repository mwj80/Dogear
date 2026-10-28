import { UserButton } from "@clerk/nextjs";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ensureHousehold } from "@/lib/ensure-household";
import { sql } from "@/lib/db";
import { createChild, createFinishReward, loadPot, resetDemo } from "./actions";

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
    child_id: string;
  }[] = [];
  let progress: {
    child_id: string;
    title: string;
    max_location: number;
    total_locations: number;
    updated_at: string;
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
             r.child_id, c.display_name, b.title
      FROM rewards r
      JOIN children c ON c.id = r.child_id
      JOIN books b ON b.id = r.book_id
      WHERE r.household_id = ${household.household_id}::uuid
      ORDER BY r.created_at DESC
    `) as typeof rewards;
    progress = (await db`
      SELECT p.child_id, b.title, p.max_location, p.total_locations, p.updated_at
      FROM progress p
      JOIN children c ON c.id = p.child_id
      JOIN books b ON b.id = p.book_id
      WHERE c.household_id = ${household.household_id}::uuid
      ORDER BY p.updated_at DESC
    `) as typeof progress;
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
            <form action={resetDemo} className="stack">
              <button type="submit" className="btn secondary">
                Reset demo
              </button>
              <p className="muted">Sets progress to page 5, rewards back to active, pot to $20.</p>
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
              kids.map((kid) => {
                const kidProgress = progress.filter((p) => p.child_id === kid.id);
                const kidRewards = rewards.filter((r) => r.child_id === kid.id);
                return (
                  <div key={kid.id} className="kid-block">
                    <p className="kid-name">
                      {kid.display_name}{" "}
                      <Link href={`/kid/${kid.id}`}>Open kid view</Link>
                    </p>
                    {kidProgress.length === 0 ? (
                      <p className="muted">No reading yet.</p>
                    ) : (
                      kidProgress.map((p) => {
                        const pct =
                          p.total_locations > 0
                            ? Math.min(100, Math.round((p.max_location / p.total_locations) * 100))
                            : 0;
                        return (
                          <div key={p.title} className="progress-row">
                            <div className="progress-meta">
                              <span>{p.title}</span>
                              <span>
                                {p.max_location} / {p.total_locations || "?"} · {pct}%
                              </span>
                            </div>
                            <div className="progress-bar">
                              <div className="progress-fill" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })
                    )}
                    {kidRewards.length > 0 && (
                      <ul className="reward-list">
                        {kidRewards.map((r) => (
                          <li key={r.id} className={r.status === "unlocked" ? "unlocked" : ""}>
                            {r.face_value} for finishing {r.title} — {r.status}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })
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
            <h2>All rewards</h2>
            {rewards.length === 0 ? (
              <p>None yet.</p>
            ) : (
              <ul>
                {rewards.map((reward) => (
                  <li key={reward.id} className={reward.status === "unlocked" ? "unlocked" : ""}>
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
