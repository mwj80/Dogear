import { sql } from "./db";

let ready = false;

export async function ensurePageLog() {
  if (ready) return;
  const db = sql();
  await db`
    CREATE TABLE IF NOT EXISTS page_log (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
      book_id uuid NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      day date NOT NULL DEFAULT CURRENT_DATE,
      pages int NOT NULL DEFAULT 0,
      UNIQUE (child_id, book_id, day)
    )
  `;
  ready = true;
}

export async function recordPages(input: {
  childId: string;
  bookId: string;
  previousMax: number;
  newMax: number;
}) {
  const delta = Math.max(0, input.newMax - input.previousMax);
  if (delta === 0) return;
  await ensurePageLog();
  const db = sql();
  await db`
    INSERT INTO page_log (child_id, book_id, day, pages)
    VALUES (${input.childId}::uuid, ${input.bookId}::uuid, CURRENT_DATE, ${delta})
    ON CONFLICT (child_id, book_id, day) DO UPDATE
    SET pages = page_log.pages + ${delta}
  `;
}
