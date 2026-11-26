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

export default async function RewardAdminPage({
  searchParams
}: {
  searchParams: Promise<{ added?: string; status?: string }>;
}) {
  const params = await searchParams;
  const added = params.added === "1";
  const statusFilter = params.status === "unlocked" ? "unlocked" : params.status === "all" ? "all" : "active";
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
           r.book_id::text AS book_id,
           (r.criteria_json->>'pages')::int AS pages,
           (r.criteria_json->>'days')::int AS days,
           r.criteria_json->>'mode' AS mode,
           c.display_name, b.title,
           COALESCE(p.max_location, 0) AS current_page
    FROM rewards r
    JOIN children c ON c.id = r.child_id
    LEFT JOIN books b ON b.id = r.book_id
    LEFT JOIN progress p ON p.child_id = r.child_id AND p.book_id = r.book_id
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
    book_id: string | null;
    current_page: number;
  }[];

  const filtered = statusFilter === "all" ? rewards : rewards.filter((r) => r.status === statusFilter);
  const byKid = new Map<string, typeof filtered>();
  for (const r of filtered) {
    const list = byKid.get(r.display_name) ?? [];
    list.push(r);
    byKid.set(r.display_name, list);
  }

  return (
    <main>
      <header className="top">
        <Link href="/parent">Back to parent</Link>
      </header>
      <h1>Reward Administration</h1>
      {added && (
        <div className="card" style={{ borderColor: "#2e7d32" }}>
          <p className="unlocked">Reward added.</p>
        </div>
      )}

      <div className="card">
        <h2 style={{ fontWeight: 700, textDecoration: "underline" }}>Set a reward</h2>
        {kids.length === 0 ? (
          <p>Add a kid first.</p>
        ) : (
          <RewardForm kids={kids} books={books} />
        )}
      </div>

      <div className="card">
        <h2 style={{ fontWeight: 700, textDecoration: "underline" }}>Existing rewards</h2>
        <p style={{ margin: "0.4rem 0 0.8rem" }}>
          <Link href="/parent/reward/new?status=active" style={{ fontWeight: statusFilter === "active" ? 700 : 400 }}>Active</Link>
          {" · "}
          <Link href="/parent/reward/new?status=unlocked" style={{ fontWeight: statusFilter === "unlocked" ? 700 : 400 }}>Unlocked</Link>
          {" · "}
          <Link href="/parent/reward/new?status=all" style={{ fontWeight: statusFilter === "all" ? 700 : 400 }}>All</Link>
        </p>
        {filtered.length === 0 ? (
          <p>None yet.</p>
        ) : (
          Array.from(byKid.entries()).map(([name, list]) => (
            <div key={name} style={{ marginBottom: "1.25rem" }}>
              <h3 style={{ fontWeight: 700, margin: "0.75rem 0 0.4rem", color: "var(--ink)" }}>{name}</h3>
              {list.map((reward) => (
                <div key={reward.id} className="reward-item" style={{ marginBottom: "0.6rem" }}>
                  <div>
                    <span>{reward.face_value}</span>
                    {" for "}
                    {criteriaLabel(
                      reward.criteria_type,
                      reward.pages,
                      reward.title,
                      reward.scope,
                      reward.mode,
                      reward.days
                    )}
                    {" "}
                    <span
                      style={{
                        fontSize: "0.8rem",
                        padding: "0.1rem 0.4rem",
                        borderRadius: "4px",
                        background: reward.status === "unlocked" ? "#e8f5e9" : "#f5f5f5",
                        color: reward.status === "unlocked" ? "#2e7d32" : "#666"
                      }}
                    >
                      {reward.status}
                    </span>
                  </div>
                  <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: "0.15rem" }}>
                    {reward.status === "active" && reward.pages
                      ? `${reward.current_page} of ${reward.pages} pages · `
                      : ""}
                    {money(Number(reward.cost_cents))} from balance
                    {Number(reward.shortfall_cents) > 0
                      ? ` · short ${money(Number(reward.shortfall_cents))}`
                      : ""}
                  </div>
                  <RewardEditor reward={reward} />
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </main>
  );
}
