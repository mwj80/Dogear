import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { updateRates } from "./actions";

type Rates = {
  robux_dollars_per_100: string;
  gift_multiplier: string;
  pizza_fixed_dollars: string;
  custom_default_dollars: string;
  updated_at: string | Date | null;
};

function updatedLabel(value: string | Date | null) {
  if (!value) return null;
  const iso = value instanceof Date ? value.toISOString() : String(value);
  return iso.slice(0, 16).replace("T", " ");
}

export default async function AdminPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const db = sql();
  const rows = await db`SELECT * FROM admin_rates LIMIT 1`;
  const rates = (rows[0] as Rates | undefined) ?? {
    robux_dollars_per_100: "0.75",
    gift_multiplier: "1.10",
    pizza_fixed_dollars: "4.00",
    custom_default_dollars: "5.00",
    updated_at: null
  };
  const updated = updatedLabel(rates.updated_at);

  return (
    <main>
      <header className="top">
        <Link href="/parent">Back to parent</Link>
      </header>
      <h1>Admin rates</h1>
      <p>
        These set the cost from balance for new and edited rewards. Existing rewards keep the cost they were saved with.
      </p>

      <div className="card">
        <form action={updateRates} className="stack">
          <label>
            Robux: dollars per 100 Robux
            <input
              name="robux_dollars_per_100"
              type="number"
              min="0.01"
              step="0.01"
              defaultValue={Number(rates.robux_dollars_per_100)}
            />
          </label>
          <p className="muted">800 Robux at $0.75 per 100 costs $6.00.</p>
          <label>
            Gift card markup
            <input
              name="gift_multiplier"
              type="number"
              min="0.01"
              step="0.01"
              defaultValue={Number(rates.gift_multiplier)}
            />
          </label>
          <p className="muted">A $10 gift card at 1.10 costs $11.00.</p>
          <label>
            Pizza coupon, fixed dollars
            <input
              name="pizza_fixed_dollars"
              type="number"
              min="0.01"
              step="0.01"
              defaultValue={Number(rates.pizza_fixed_dollars)}
            />
          </label>
          <label>
            Custom reward, default dollars
            <input
              name="custom_default_dollars"
              type="number"
              min="0.01"
              step="0.01"
              defaultValue={Number(rates.custom_default_dollars)}
            />
          </label>
          <button type="submit" className="btn">
            Save rates
          </button>
          {updated && <p className="muted">Last updated {updated}</p>}
        </form>
      </div>
    </main>
  );
}
