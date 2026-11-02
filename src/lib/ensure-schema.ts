import { sql } from "./db";

/** Idempotent schema additions for the library / purchase feature. */
export async function ensureSchema() {
  const db = sql();
  await db`
    ALTER TABLE books
    ADD COLUMN IF NOT EXISTS price_cents integer NOT NULL DEFAULT 0
  `;
  await db`
    ALTER TABLE children
    ADD COLUMN IF NOT EXISTS can_self_purchase boolean NOT NULL DEFAULT false
  `;
  await db`
    CREATE TABLE IF NOT EXISTS kid_books (
      child_id uuid REFERENCES children(id) ON DELETE CASCADE,
      book_id uuid REFERENCES books(id) ON DELETE CASCADE,
      purchased_at timestamptz DEFAULT now(),
      purchased_by text NOT NULL CHECK (purchased_by IN ('parent', 'self')),
      PRIMARY KEY (child_id, book_id)
    )
  `;
}
