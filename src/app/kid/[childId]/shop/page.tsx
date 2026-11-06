import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import { ensureSchema } from "@/lib/ensure-schema";
import { ensureClassics } from "@/lib/ensure-classics";
import { addOrBuyBook } from "@/app/parent/purchase-actions";

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default async function KidShopPage({
  params
}: {
  params: Promise<{ childId: string }>;
}) {
  const { childId } = await params;
  const db = sql();
  await ensureSchema();
  await ensureClassics();

  const kids = await db`
    SELECT id, display_name, COALESCE(can_self_purchase, false) AS can_self_purchase, household_id
    FROM children
    WHERE id = ${childId}::uuid
    LIMIT 1
  `;
  const kid = kids[0] as
    | { id: string; display_name: string; can_self_purchase: boolean; household_id: string }
    | undefined;
  if (!kid) notFound();

  if (!kid.can_self_purchase) {
    return (
      <main>
        <header className="top">
          <Link href={`/kid/${kid.id}`}>Back</Link>
        </header>
        <h1>Shop</h1>
        <p>You don’t have permission to buy books. Ask a parent.</p>
      </main>
    );
  }

  const house = await db`
    SELECT pot_available_cents FROM households WHERE id = ${kid.household_id}::uuid
  `;
  const balance = Number(
    (house[0] as { pot_available_cents: number } | undefined)?.pot_available_cents ?? 0
  );

  const books = (await db`
    SELECT b.id, b.title, b.author, b.price_cents
    FROM books b
    WHERE NOT EXISTS (
      SELECT 1 FROM kid_books kb
      WHERE kb.child_id = ${kid.id}::uuid AND kb.book_id = b.id
    )
    ORDER BY b.title
  `) as { id: string; title: string; author: string; price_cents: number }[];

  return (
    <main>
      <header className="top">
        <Link href={`/kid/${kid.id}`}>Back</Link>
      </header>
      <h1>Shop</h1>
      <p>Available balance: {money(balance)}</p>
      <p className="muted">Buying adds the book to your reader.</p>

      {books.length === 0 ? (
        <div className="card">
          <p>No more books to add.</p>
        </div>
      ) : (
        books.map((book) => {
          const price = Number(book.price_cents || 0);
          const canAfford = price === 0 || balance >= price;
          return (
            <div key={book.id} className="card">
              <p>
                <strong>{book.title}</strong> — {book.author}
              </p>
              <p className="muted">{price === 0 ? "Free" : money(price)}</p>
              {canAfford ? (
                <form action={addOrBuyBook}>
                  <input type="hidden" name="child_id" value={kid.id} />
                  <input type="hidden" name="book_id" value={book.id} />
                  <input type="hidden" name="by" value="self" />
                  <button type="submit" className="btn">
                    {price === 0 ? "Add" : `Buy for ${money(price)}`}
                  </button>
                </form>
              ) : (
                <p className="muted">Not enough balance.</p>
              )}
            </div>
          );
        })
      )}
    </main>
  );
}
