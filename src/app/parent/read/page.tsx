import Link from "next/link";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { ensureHousehold } from "@/lib/ensure-household";
import { ensureSchema } from "@/lib/ensure-schema";

export default async function ParentReadPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? `${userId}@users.invalid`;
  const household = await ensureHousehold({ clerkUserId: userId, email });
  const db = sql();
  await ensureSchema();

  const books = (await db`
    SELECT id, slug, title, author, COALESCE(cover_url, '') AS cover_url, COALESCE(teaser, '') AS teaser
    FROM books
    WHERE COALESCE(drm_required, false) = false
    ORDER BY title
  `) as { id: string; slug: string; title: string; author: string; cover_url: string; teaser: string }[];

  return (
    <main>
      <header className="top">
        <Link href="/parent">Back to parent</Link>
      </header>
      <h1>Read</h1>
      <p className="muted">Books you can read. Progress is saved separately from your kids.</p>
      {books.length === 0 ? (
        <div className="card"><p>No books available yet.</p></div>
      ) : (
        <div style={{ display: "grid", gap: "0.75rem" }}>
          {books.map((book) => (
            <Link key={book.id} href={`/parent/read/${book.slug}`} className="card" style={{ display: "flex", gap: "0.85rem", textDecoration: "none", color: "inherit" }}>
              {book.cover_url && (
                <img src={book.cover_url} alt="" style={{ width: 48, height: 72, objectFit: "cover", borderRadius: 4, flexShrink: 0 }} />
              )}
              <div>
                <strong>{book.title}</strong>
                {book.author && <span className="muted"> — {book.author}</span>}
                {book.teaser && <p className="muted" style={{ margin: "0.25rem 0 0", fontSize: "0.9rem" }}>{book.teaser}</p>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
