import Link from "next/link";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { ensureHousehold } from "@/lib/ensure-household";
import { ensureSchema } from "@/lib/ensure-schema";
import { ensureClassics } from "@/lib/ensure-classics";
import { BOOK_GENRES, coverAndTeaserForSlug } from "@/lib/gutenberg-classics";
import { searchGutendex } from "@/lib/gutendex";
import { addOrBuyBook, addCatalogBook } from "../purchase-actions";

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default async function ParentShopPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; genre?: string; error?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const params = await searchParams;
  const q = String(params.q ?? "").trim();
  const genre = String(params.genre ?? "").trim();
  const error = String(params.error ?? "").trim();

  const user = await currentUser();
  const email =
    user?.primaryEmailAddress?.emailAddress ?? `${userId}@users.invalid`;
  const household = await ensureHousehold({ clerkUserId: userId, email });
  const db = sql();
  await ensureSchema();
  await ensureClassics();

  const kids = (await db`
    SELECT id, display_name
    FROM children
    WHERE household_id = ${household.household_id}::uuid
    ORDER BY created_at
  `) as { id: string; display_name: string }[];

  const books = (await db`
    SELECT id, slug, title, author, COALESCE(genre, '') AS genre, COALESCE(price_cents, 0) AS price_cents
    FROM books
    WHERE (${q} = '' OR title ILIKE ${'%' + q + '%'} OR author ILIKE ${'%' + q + '%'})
      AND (${genre} = '' OR genre = ${genre})
    ORDER BY title
  `) as { id: string; slug: string; title: string; author: string; genre: string; price_cents: number }[];

  const catalogResult = q ? await searchGutendex({ q, allowAdult: true }) : { hits: [] };
  const knownRows = (await db`SELECT slug FROM books WHERE slug LIKE 'gutenberg-%'`) as { slug: string }[];
  const knownSlugs = new Set(knownRows.map((row) => row.slug));
  const freshCatalog = catalogResult.hits.filter((hit) => !knownSlugs.has(`gutenberg-${hit.gutenbergId}`));

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

      {error && (
        <div className="warning">{error}</div>
      )}

      <form key={`${q}|${genre}`} method="get" className="card" style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search title or author"
          aria-label="Search title or author"
          style={{ flex: "1 1 12rem" }}
        />
        <select name="genre" defaultValue={genre} aria-label="Genre">
          <option value="">All genres</option>
          {BOOK_GENRES.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
        <button type="submit" className="btn secondary">Search</button>
        {(q || genre) && (
          <Link href="/parent/shop">Clear</Link>
        )}
      </form>

      {catalogResult.error && (
        <div className="card">
          <p className="muted">{catalogResult.error}</p>
        </div>
      )}

      {kids.length === 0 ? (
        <div className="card">
          <p>Add a kid on Family Administration first.</p>
        </div>
      ) : (
        <>
          {books.length === 0 && freshCatalog.length === 0 ? (
            <div className="card">
              <p>{q || genre ? "No books match that search." : "No books yet."}</p>
            </div>
          ) : (
            books.map((book) => {
              const meta = coverAndTeaserForSlug(book.slug);
              return (
                <div key={book.id} className="card" style={{ display: "flex", gap: "0.85rem", alignItems: "flex-start" }}>
                  {meta.cover && (
                    <img
                      src={meta.cover}
                      alt=""
                      style={{ width: 56, height: 84, objectFit: "cover", borderRadius: 6, flexShrink: 0, background: "#eee" }}
                    />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: "0 0 0.2rem" }}>
                      <strong>{book.title}</strong>
                      {book.author ? ` — ${book.author}` : ""}
                      {book.genre ? ` · ${book.genre}` : ""} · {money(Number(book.price_cents || 0))}
                    </p>
                    {meta.teaser && (
                      <p className="muted" style={{ margin: "0 0 0.5rem", fontSize: "0.9rem" }}>{meta.teaser}</p>
                    )}
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
                </div>
              );
            })
          )}

          {freshCatalog.length > 0 && (
            <>
              <h2>From Project Gutenberg</h2>
              <p className="muted">These are not in the shop yet. Adding one saves it for free.</p>
              {freshCatalog.map((hit) => (
                <div key={hit.gutenbergId} className="card" style={{ display: "flex", gap: "0.85rem", alignItems: "flex-start" }}>
                  <img
                    src={hit.coverUrl}
                    alt=""
                    style={{ width: 56, height: 84, objectFit: "cover", borderRadius: 6, flexShrink: 0, background: "#eee" }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: "0 0 0.2rem" }}>
                      <strong>{hit.title}</strong>
                      {hit.author ? ` — ${hit.author}` : ""} · Free
                    </p>
                    <p className="muted" style={{ margin: "0 0 0.5rem", fontSize: "0.9rem" }}>{hit.teaser}</p>
                    {kids.map((kid) => (
                      <form
                        key={`${kid.id}-${hit.gutenbergId}`}
                        action={addCatalogBook}
                        style={{ display: "inline", marginRight: "0.5rem" }}
                      >
                        <input type="hidden" name="child_id" value={kid.id} />
                        <input type="hidden" name="gutenberg_id" value={hit.gutenbergId} />
                        <input type="hidden" name="title" value={hit.title} />
                        <input type="hidden" name="author" value={hit.author} />
                        <input type="hidden" name="genre" value={hit.subjects[0] ?? ""} />
                        <input type="hidden" name="by" value="parent" />
                        <button type="submit" className="btn secondary">
                          Add for {kid.display_name}
                        </button>
                      </form>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </>
      )}
    </main>
  );
}
