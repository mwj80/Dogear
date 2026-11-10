import { UserButton } from "@clerk/nextjs";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ensureHousehold } from "@/lib/ensure-household";
import { sql } from "@/lib/db";
import { ensurePageLog } from "@/lib/page-log";
import { recheckHousehold } from "@/lib/check-unlocks";
import { markReleaseSent } from "./kid/actions";
import { resetDemo } from "./actions";
import { ensureSchema } from "@/lib/ensure-schema";
import CopyCode from "@/app/copy-code";

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default async function ParentPage({
  searchParams
}: {
  searchParams: Promise<{ funds?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const params = await searchParams;
  const fundsAdded = Number(params.funds ?? 0);

  const user = await currentUser();
  const email =
    user?.primaryEmailAddress?.emailAddress ?? `${userId}@users.invalid`;

  let household: { household_id: string; pot_available_cents: number } | null = null;
  let kids: { id: string; display_name: string }[] = [];
  let releases: { id: string; display_name: string; provider: string; identifier: string; face_value: string; status: string; code: string | null }[] = [];
  let dbError: string | null = null;

  try {
    household = await ensureHousehold({ clerkUserId: userId, email });
    await ensurePageLog();
    await ensureSchema();
    await recheckHousehold(household.household_id);
    const db = sql();
    kids = (await db`
      SELECT id, display_name FROM children
      WHERE household_id = ${household.household_id}::uuid
      ORDER BY created_at
    `) as { id: string; display_name: string }[];
    releases = (await db`
      SELECT rr.id::text AS id, c.display_name, rr.provider, rr.identifier,
             rr.face_value, rr.status, rr.code
      FROM reward_releases rr
      JOIN children c ON c.id = rr.child_id
      WHERE c.household_id = ${household.household_id}::uuid
        AND rr.status IN ('pending', 'unmatched')
      ORDER BY rr.created_at DESC
    `) as typeof releases;
  } catch (err) {
    dbError = err instanceof Error ? err.message : "Database error";
  }

  const availableCents = household ? Number(household.pot_available_cents) : 0;

  return (
    <main>
      <header className="top">
        <Link href="/">✨ LitLoot</Link>
        <span>
          <Link href="/teacher">Teacher</Link>
          <Link href="/admin">Rates</Link>
          <UserButton />
        </span>
      </header>
      <h1>Parent dashboard</h1>
      <p>Signed in as {email}.</p>
      {fundsAdded > 0 && (
        <div className="card" style={{ borderColor: "#2e7d32" }}>
          <p className="unlocked">Added {money(fundsAdded)} to the available balance.</p>
        </div>
      )}
      {!dbError && releases.length > 0 && (
        <div className="card" style={{ borderColor: "#d32f2f" }}>
          <h2 style={{ textDecoration: "underline" }}>Reward releases</h2>
          <p className="muted">Proof of concept. Codes are mock. Copy and redeem, or mark sent after delivery.</p>
          <ul className="reward-list">
            {releases.map((release) => (
              <li key={release.id}>
                {release.display_name}
                {" · "}
                {release.face_value}
                {" · "}
                {release.provider === "roblox" ? "Roblox" : release.provider === "clash_royale" ? "Clash Royale" : "Gift card"}
                {" · "}
                {release.status === "unmatched" ? "no account saved" : release.identifier}
                {release.code && (
                  <>
                    {" · "}
                    <CopyCode code={release.code} />
                  </>
                )}
                {release.status === "pending" && (
                  <form action={markReleaseSent} style={{ display: "inline", marginLeft: "0.5rem" }}>
                    <input type="hidden" name="release_id" value={release.id} />
                    <button type="submit" className="btn" style={{ padding: "0.2rem 0.5rem", fontSize: "0.8rem" }}>
                      Mark sent
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="card">
        {dbError ? (
          <p>Could not reach the database: {dbError}</p>
        ) : (
          <>
            <div className="balance-strip">
              <div>
                <span>Available balance</span>
                <strong>{money(availableCents)}</strong>
              </div>
            </div>
            <p>
              <Link href="/parent/funds">Add Funds</Link>
            </p>
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
              kids.map((kid) => (
                <div key={kid.id} className="kid-block">
                  <p style={{ display: "flex", alignItems: "baseline", gap: "1rem", flexWrap: "wrap" }}>
                    <span className="kid-name">{kid.display_name}</span>
                    <Link href={`/parent/kid/${kid.id}`}>Progress</Link>
                    <Link href={`/kid/${kid.id}`}>Open kid view</Link>
                  </p>
                </div>
              ))
            )}
            <p>
              <Link href="/parent/kid/new">Family Administration</Link>
            </p>
          </div>
          <div className="card">
            <h2>Reward</h2>
            <p>
              <Link href="/parent/reward/new">Reward Administration</Link>
            </p>
          </div>
          <div className="card">
            <h2>Shop</h2>
            <p>
              <Link href="/parent/shop">Shop for Books</Link>
            </p>
          </div>
        </>
      )}
      <form action={resetDemo} style={{ textAlign: "center", margin: "1.5rem 0 1rem" }}>
        <button type="submit" className="btn secondary">
          Reset demo
        </button>
      </form>
    </main>
  );
}
