import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "@/lib/db";

export default async function BookStubPage({
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
    SELECT title, author, epub_path FROM books WHERE slug = ${slug} LIMIT 1
  `;
  if (!kids[0] || !books[0]) notFound();

  const kid = kids[0] as { id: string; display_name: string };
  const book = books[0] as { title: string; author: string; epub_path: string };

  return (
    <main>
      <header className="top">
        <Link href={`/kid/${kid.id}`}>All books</Link>
      </header>
      <h1>{book.title}</h1>
      <p>{book.author}</p>
      <div className="card">
        <p>
          Reader is next. This book will load from{" "}
          <span className="code">{book.epub_path}</span>
        </p>
        <p>Reading as {kid.display_name}.</p>
      </div>
    </main>
  );
}
