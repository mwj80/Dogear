import Link from "next/link";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { ensureHousehold } from "@/lib/ensure-household";
import { ensureSchema } from "@/lib/ensure-schema";
import { createChild } from "../../actions";
import { removeKid } from "../actions";
import { toggleSelfPurchase } from "../../purchase-actions";
import { SelfPurchaseForm } from "./self-purchase-form";

export default async function FamilyAdminPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const user = await currentUser();
  const email =
    user?.primaryEmailAddress?.emailAddress ?? `${userId}@users.invalid`;
  const household = await ensureHousehold({ clerkUserId: userId, email });
  const db = sql();
  await ensureSchema();

  const kids = (await db`
    SELECT id, display_name, COALESCE(can_self_purchase, false) AS can_self_purchase
    FROM children
    WHERE household_id = ${household.household_id}::uuid
    ORDER BY created_at
  `) as { id: string; display_name: string; can_self_purchase: boolean }[];

  return (
    <main>
      <header className="top">
        <Link href="/parent">Back to parent</Link>
      </header>
      <h1>Family Administration</h1>
      <p>Add kids, remove them, and control who can buy books.</p>

      <div className="card">
        <h2>Add a kid</h2>
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

      <div className="card">
        <h2>Kids</h2>
        {kids.length === 0 ? (
          <p>No kids yet.</p>
        ) : (
          kids.map((kid) => (
            <div key={kid.id} className="kid-block">
              <p className="kid-name">{kid.display_name}</p>
              <SelfPurchaseForm
                childId={kid.id}
                displayName={kid.display_name}
                canSelfPurchase={!!kid.can_self_purchase}
                action={toggleSelfPurchase}
              />
              <form action={removeKid} className="stack">
                <input type="hidden" name="child_id" value={kid.id} />
                <button type="submit" className="btn secondary">
                  Remove {kid.display_name}
                </button>
                <p className="muted">
                  Removes this kid, their reading progress, and their rewards. Ledger history stays.
                </p>
              </form>
            </div>
          ))
        )}
      </div>
    </main>
  );
}
