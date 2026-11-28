import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { updateRates } from "./actions";
import { addCatalogBook } from "../parent/catalog-actions";

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
            Markup multiplier
            <input
              name="gift_multiplier"
              type="number"
              min="1.00"
              step="0.01"
              defaultValue={Number(rates.gift_multiplier)}
            />
          </label>
          <p className="muted">A $5 gift card at 1.10 costs $5.50. Custom rewards are not marked up.</p>

          <button type="submit" className="btn">
            Save rates
          </button>
          {updated && <p className="muted">Last updated {updated}</p>}
        </form>
      </div>
    
      <h2 style={{ marginTop: "2rem" }}>Catalog</h2>
      <details open>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>Add a book to the catalog</summary>
        <form action={addCatalogBook} style={{ display: "grid", gap: "0.5rem", marginTop: "0.75rem", maxWidth: "36rem" }}>
          <input name="title" placeholder="Title" required />
          <input name="author" placeholder="Author" required />
          <input name="slug" placeholder="Slug (e.g. nancy-drew-1)" required />
          <input name="epub_path" placeholder="EPUB path (e.g. /books/nancy-drew-1.epub)" required />
          <input name="genre" placeholder="Genre" />
          <input name="publisher" placeholder="Publisher" />
          <input name="source" placeholder="Source (gutenberg, licensed, manual)" defaultValue="manual" />
          <input name="cover_url" placeholder="Cover image URL" />
          <input name="teaser" placeholder="One-sentence teaser" />
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <input name="age_min" type="number" placeholder="Min age" style={{ width: "6rem" }} />
            <input name="age_max" type="number" placeholder="Max age" style={{ width: "6rem" }} />
            <input name="price_cents" type="number" placeholder="Price (cents)" defaultValue="0" style={{ width: "8rem" }} />
          </div>
          <input name="series" placeholder="Series name" />
          <input name="series_number" type="number" placeholder="Series #" style={{ width: "6rem" }} />
          <label style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <input type="checkbox" name="drm_required" /> DRM required
          </label>
          <button type="submit" className="btn">Add to catalog</button>
        </form>
      </details>

    </main>
  );
}
