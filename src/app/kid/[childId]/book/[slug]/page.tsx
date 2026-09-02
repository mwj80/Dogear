import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import Reader from "./reader";

export default async function BookPage({
  params
}: {
  params: Promise<{ childId: string; slug: string }>;
}) {
  const { childId, slug } = await params;
  const db = sql();

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
      />
    </main>
  );
}
