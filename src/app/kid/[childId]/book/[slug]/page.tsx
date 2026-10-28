import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import { ensurePageLog } from "@/lib/page-log";
import Reader from "./reader";

export default async function BookPage({
  params
}: {
  params: Promise<{ childId: string; slug: string }>;
}) {
  const { childId, slug } = await params;
  const db = sql();
  await ensurePageLog();

  const kids = await db`
    SELECT id, display_name FROM children WHERE id = ${childId}::uuid LIMIT 1
  `;
  const books = await db`
    SELECT id, title, author, epub_path FROM books WHERE slug = ${slug} LIMIT 1
  `;
  if (!kids[0] || !books[0]) notFound();

  const kid = kids[0] as { id: string; display_name: string };
  const book = books[0] as {
    id: string;
    title: string;
    author: string;
    epub_path: string;
  };

  const progress = await db`
    SELECT max_location, total_locations
    FROM progress
    WHERE child_id = ${kid.id}::uuid AND book_id = ${book.id}::uuid
    LIMIT 1
  `;
  const startLocation = progress[0]
    ? Number((progress[0] as { max_location: number }).max_location)
    : 0;

  const read = await db`
    SELECT
      COALESCE(SUM(pages) FILTER (WHERE book_id = ${book.id}::uuid), 0)::int AS this_book,
      COALESCE(SUM(pages), 0)::int AS across
    FROM page_log
    WHERE child_id = ${kid.id}::uuid
  `;
  const readThis = Number((read[0] as { this_book: number } | undefined)?.this_book ?? 0);
  const readAcross = Number((read[0] as { across: number } | undefined)?.across ?? 0);

  const rewards = (await db`
    SELECT id, face_value, status, criteria_type, scope,
           (criteria_json->>'pages')::int AS pages,
           criteria_json->>'mode' AS mode
    FROM rewards
    WHERE child_id = ${kid.id}::uuid
      AND criteria_type IN ('finish_book', 'total_pages')
      AND (book_id = ${book.id}::uuid OR scope = 'any')
    ORDER BY created_at
  `) as {
    id: string;
    face_value: string;
    status: string;
    criteria_type: string;
    scope: string;
    pages: number | null;
    mode: string | null;
  }[];

  return (
    <main>
      <header className="top">
        <Link href={`/kid/${kid.id}`}>All books</Link>
      </header>
      <h1>{book.title}</h1>
      <p>
        {book.author} · Reading as {kid.display_name}
      </p>
      <Reader
        childId={kid.id}
        bookId={book.id}
        epubPath={book.epub_path}
        startLocation={startLocation}
        readThis={readThis}
        readAcross={readAcross}
        rewards={rewards}
      />
    </main>
  );
}
