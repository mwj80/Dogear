import Link from "next/link";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { stripe } from "@/lib/stripe";
import { ensureHousehold } from "@/lib/ensure-household";
import { sql } from "@/lib/db";
import { ensureSchema } from "@/lib/ensure-schema";

export default async function FundsSuccessPage({
  searchParams
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const params = await searchParams;
  const sessionId = params.session_id;
  if (!sessionId) redirect("/parent/funds");

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? `${userId}@users.invalid`;
  const household = await ensureHousehold({ clerkUserId: userId, email });
  const db = sql();
  await ensureSchema();

  const session = await stripe().checkout.sessions.retrieve(sessionId);
  if (session.payment_status !== "paid") {
    return (
      <main>
        <h1>Payment not completed</h1>
        <p><Link href="/parent/funds">Back to Add Funds</Link></p>
      </main>
    );
  }

  const cents = Number(session.metadata?.cents ?? 0);
  const hid = session.metadata?.household_id;
  if (!cents || hid !== household.household_id) {
    return (
      <main>
        <h1>Could not apply funds</h1>
        <p><Link href="/parent/funds">Back to Add Funds</Link></p>
      </main>
    );
  }

  // Idempotent credit
  const existing = await db`
    SELECT 1 FROM ledger
    WHERE household_id = ${household.household_id}::uuid
      AND note = ${`Stripe ${sessionId}`}
    LIMIT 1
  `;
  if (!existing[0]) {
    await db`
      UPDATE households
      SET pot_available_cents = pot_available_cents + ${cents},
          pot_loaded_cents = pot_loaded_cents + ${cents}
      WHERE id = ${household.household_id}::uuid
    `;
    await db`
      INSERT INTO ledger (household_id, kind, amount_cents, note)
      VALUES (${household.household_id}::uuid, 'load', ${cents}, ${`Stripe ${sessionId}`})
    `;
  }

  return (
    <main>
      <h1>Funds added</h1>
      <p>${(cents / 100).toFixed(2)} has been added to your balance.</p>
      <p><Link href="/parent">Back to parent</Link></p>
    </main>
  );
}
