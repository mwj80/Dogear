import Link from "next/link";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { ensureHousehold } from "@/lib/ensure-household";
import { ensureSchema } from "@/lib/ensure-schema";
import { addOrBuyBook, importGutenbergClassics } from "../purchase-actions";

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default async function ParentShopPage({
  searchParams
}: {
  searchParams: Promise<{ imported?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const params = await searchParams;
  const imported = Number(params.imported ?? "");

  const user = await currentUser();
  const email =
    user?.primaryEmailAddress?.emailAddress ?? `${userId}@users.invalid`;
  const household = await ensureHousehold({ clerkUserId: userId, email });
  const db = sql();
  await ensureSchema();

  const kids = (await db`
    SELECT id, display_name
    FROM children
    WHERE household_id = ${household.household_id}::uuid
    ORDER BY created_at
  `) as { id: string; display_name: string }[];

  const books = (await db`
    SELECT id, title, author, COALESCE(price_cents, 0) AS price_cents
    FROM books
    ORDER BY title
  `) as { id: string; title: string; author: string; price_cents: number }[];

  const owned = (await db`
    SELECT kb.child_id::text AS child_id, kb.book_id::text AS book_id
    FROM kid_books kb
    JOIN children c ON c.id = kb.child_id
    WHERE c.household_id = ${household.household_id}::uuid
  `) as { child_id: string; book_id: string }[];
  const ownedSet = new Set(owned.map((o) => `${o.child_id}:${o.book_id}`));

  return (
    <main>
      <header className="top">
        <Link href="/parent">Back to parent</Link>
      </header>
      <h1>Shop for Books</h1>
      <p className="muted">
        Add free books or buy titles for your kids. Authorized kids can buy for themselves.
        Buying creates a progress row immediately. Books a kid already owns are hidden.
      </p>

      {Number.isFinite(imported) && imported >= 0 && params.imported !== undefined && (
        <div className="card" style={{ borderColor: "#2e7d32" }}>
          <p className="unlocked">
            {imported === 0
              ? "Classics already in the shop. No new books added."
              : `Added ${imported} public-domain classic${imported === 1 ? "" : "s"}.`}
          </p>
        </div>
      )}

      <div className="card">
        <p className="section-head">Public-domain classics</p>
        <p className="muted">
          Import free Project Gutenberg titles. Existing books are left alone. Nothing is added to a kid’s reader.
        </p>
        <form action={importGutenbergClassics}>
          <button type="submit" className="btn secondary">
            Import classics
          </button>
        </form>
      </div>

      {kids.length === 0 ? (
        <div className="card">
          <p>Add a kid on Family Administration first.</p>
        </div>
      ) : books.length === 0 ? (
        <div className="card">
          <p>No books yet. Import classics above, or reset the demo on the parent page.</p>
        </div>
      ) : (
        books.map((book) => (
          <div key={book.id} className="card">
            <p>
              <strong>{book.title}</strong>
              {book.author ? ` — ${book.author}` : ""} · {money(Number(book.price_cents || 0))}
            </p>
            {kids.map((kid) => {
              const alreadyOwns = ownedSet.has(`${kid.id}:${book.id}`);
              if (alreadyOwns) return null;
              return (
                <form
                  key={`${kid.id}-${book.id}`}
                  action={addOrBuyBook}
                  style={{ display: "inline", marginRight: "0.5rem" }}
                >
                  <input type="hidden" name="child_id" value={kid.id} />
                  <input type="hidden" name="book_id" value={book.id} />
                  <input type="hidden" name="by" value="parent" />
                  <button type="submit" className="btn secondary">
                    Add/Buy for {kid.display_name}
                  </button>
                </form>
              );
            })}
          </div>
        ))
      )}
    </main>
  );
}
