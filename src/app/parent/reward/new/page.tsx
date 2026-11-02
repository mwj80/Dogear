import Link from "next/link";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ensureHousehold } from "@/lib/ensure-household";
import { sql } from "@/lib/db";
import RewardForm from "../../reward-form";
import RewardEditor from "../../reward-editor";

function criteriaLabel(
  type: string,
  pages: number | null,
  title: string | null,
  scope: string,
  mode: string | null,
  days: number | null
) {
  if (type === "daily_streak") {
    const where = scope === "any" ? "in any book" : `in ${title}`;
    return `reading ${pages} pages a day for ${days} days ${where}`;
  }
  const read = mode === "read" || scope === "any";
  if (scope === "any") {
    return pages ? `reading ${pages} pages in any book` : "reading pages in any book";
  }
  if (type === "finish_book") return `finishing ${title}`;
  if (read && pages) return `reading ${pages} pages in ${title}`;
  if (pages) return `reaching page ${pages} in ${title}`;
  return `finishing ${title}`;
}

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default async function RewardAdminPage() {
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

  const rewards = (await db`
    SELECT r.id, r.face_value, r.reward_type, r.status, r.cost_cents,
           r.shortfall_cents, r.child_id, r.criteria_type, r.scope,
           (r.criteria_json->>'pages')::int AS pages,
           (r.criteria_json->>'days')::int AS days,
           r.criteria_json->>'mode' AS mode,
           c.display_name, b.title
    FROM rewards r
    JOIN children c ON c.id = r.child_id
    LEFT JOIN books b ON b.id = r.book_id
    WHERE r.household_id = ${household.household_id}::uuid
    ORDER BY r.created_at DESC
  `) as {
    id: string;
    face_value: string;
    reward_type: string;
    status: string;
    cost_cents: number;
    shortfall_cents: number;
    child_id: string;
    criteria_type: string;
    scope: string;
    pages: number | null;
    days: number | null;
    mode: string | null;
    display_name: string;
    title: string | null;
  }[];

  return (
    <main>
      <header className="top">
        <Link href="/parent">Back to parent</Link>
      </header>
      <h1>Reward Administration</h1>

      <div className="card">
        <h2>Set a reward</h2>
        {kids.length === 0 ? (
          <p>Add a kid first.</p>
        ) : (
          <RewardForm kids={kids} books={books} />
        )}
      </div>

      <div className="card">
        <h2>Existing rewards</h2>
        {rewards.length === 0 ? (
          <p>None yet.</p>
        ) : (
          rewards.map((reward) => (
            <div key={reward.id} className="reward-item">
              <div className={reward.status === "unlocked" ? "unlocked" : ""}>
                {reward.display_name}: {reward.face_value} for{" "}
                {criteriaLabel(
                  reward.criteria_type,
                  reward.pages,
                  reward.title,
                  reward.scope,
                  reward.mode,
                  reward.days
                )}{" "}
                — {reward.status} ({money(Number(reward.cost_cents))} from balance)
                {Number(reward.shortfall_cents) > 0
                  ? ` — short ${money(Number(reward.shortfall_cents))}`
                  : ""}
              </div>
              <RewardEditor reward={reward} />
            </div>
          ))
        )}
      </div>
    </main>
  );
}
