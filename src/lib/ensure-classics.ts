import { sql } from "./db";
import { GUTENBERG_CLASSICS, gutenbergEpubPath } from "./gutenberg-classics";

/** Make sure the curated free classics exist in books. Idempotent. */
export async function ensureClassics() {
  const db = sql();
  for (const book of GUTENBERG_CLASSICS) {
    const path = gutenbergEpubPath(book.id);
    const series = "series" in book ? book.series : null;
    const seriesNumber = "series_number" in book ? book.series_number : null;
    await db`
      INSERT INTO books (title, author, slug, price_cents, epub_path, genre, series, series_number)
      VALUES (${book.title}, ${book.author}, ${book.slug}, 0, ${path}, ${book.genre}, ${series}, ${seriesNumber})
      ON CONFLICT (slug) DO UPDATE SET
        genre = EXCLUDED.genre,
        title = EXCLUDED.title,
        author = EXCLUDED.author,
        epub_path = EXCLUDED.epub_path,
        series = EXCLUDED.series,
        series_number = EXCLUDED.series_number
    `;
  }
}
