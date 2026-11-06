import { sql } from "./db";
import { GUTENBERG_CLASSICS, gutenbergEpubPath } from "./gutenberg-classics";

/** Make sure the curated free classics exist in books. Idempotent. */
export async function ensureClassics() {
  const db = sql();
  for (const book of GUTENBERG_CLASSICS) {
    const path = gutenbergEpubPath(book.id);
    await db`
      INSERT INTO books (title, author, slug, price_cents, epub_path, genre)
      VALUES (${book.title}, ${book.author}, ${book.slug}, 0, ${path}, ${book.genre})
      ON CONFLICT (slug) DO UPDATE SET
        genre = EXCLUDED.genre,
        title = EXCLUDED.title,
        author = EXCLUDED.author,
        epub_path = EXCLUDED.epub_path
    `;
  }
}
