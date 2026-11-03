import Link from "next/link";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ensureHousehold } from "@/lib/ensure-household";
import { loadPot } from "../actions";

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default async function AddFundsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const user = await currentUser();
  const email =
    user?.primaryEmailAddress?.emailAddress ?? `${userId}@users.invalid`;
  const household = await ensureHousehold({ clerkUserId: userId, email });
  const available = Number(household.pot_available_cents ?? 0);

  return (
    <main>
      <header className="top">
        <Link href="/parent">Back to parent</Link>
      </header>
      <h1>Add Funds</h1>
      <p>Available balance: {money(available)}</p>

      <div className="card">
        <form action={loadPot} className="stack">
          <label>
            Add dollars
            <input name="dollars" type="number" min="1" step="1" defaultValue="10" />
          </label>
          <button type="submit" className="btn">
            Add to balance
          </button>
        </form>
      </div>
    </main>
  );
}
