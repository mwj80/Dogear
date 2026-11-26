import Link from "next/link";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ensureHousehold } from "@/lib/ensure-household";
import { createCheckoutSession } from "./actions";
import { hasStripe } from "@/lib/stripe";

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default async function AddFundsPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; canceled?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const params = await searchParams;
  const error = params.error;
  const canceled = params.canceled === "1";

  const user = await currentUser();
  const email =
    user?.primaryEmailAddress?.emailAddress ?? `${userId}@users.invalid`;
  const household = await ensureHousehold({ clerkUserId: userId, email });
  const available = Number(household.pot_available_cents ?? 0);
  const stripeReady = hasStripe();

  return (
    <main>
      <header className="top">
        <Link href="/parent">Back to parent</Link>
      </header>
      <h1>Add Funds</h1>
      <p>Available balance: {money(available)}</p>

      {canceled && (
        <div className="card">
          <p>Payment canceled.</p>
        </div>
      )}
      {error === "amount" && (
        <div className="card" style={{ borderColor: "#d32f2f" }}>
          <p>Enter at least $1.</p>
        </div>
      )}
      {error === "stripe" && (
        <div className="card" style={{ borderColor: "#d32f2f" }}>
          <p>Payments are not configured yet.</p>
        </div>
      )}

      <div className="card">
        {stripeReady ? (
          <form action={createCheckoutSession} className="stack">
            <label>
              Add dollars
              <input name="dollars" type="number" min="1" step="1" defaultValue="10" />
            </label>
            <button type="submit" className="btn">
              Continue to payment
            </button>
          </form>
        ) : (
          <p className="muted">Payments are not configured yet. Set STRIPE_SECRET_KEY to enable real checkout.</p>
        )}
      </div>
    </main>
  );
}
