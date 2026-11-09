import { sql } from "./db";

/** Idempotent schema additions for the library / purchase feature. */
export async function ensureSchema() {
  const db = sql();
  await db`
    ALTER TABLE books
    ADD COLUMN IF NOT EXISTS price_cents integer NOT NULL DEFAULT 0
  `;
  await db`
    ALTER TABLE books
    ADD COLUMN IF NOT EXISTS genre text
  `;
  await db`
    ALTER TABLE books
    ADD COLUMN IF NOT EXISTS isbn text
  `;
  await db`
    ALTER TABLE books
    ADD COLUMN IF NOT EXISTS publisher text
  `;
  await db`
    ALTER TABLE books
    ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'gutenberg'
  `;
  await db`
    ALTER TABLE books
    ADD COLUMN IF NOT EXISTS drm_required boolean NOT NULL DEFAULT false
  `;
  await db`
    ALTER TABLE books
    ADD COLUMN IF NOT EXISTS license_status text NOT NULL DEFAULT 'available'
  `;
  await db`
    ALTER TABLE books
    ADD COLUMN IF NOT EXISTS series text
  `;
  await db`
    ALTER TABLE books
    ADD COLUMN IF NOT EXISTS series_number integer
  `;
  await db`
    CREATE UNIQUE INDEX IF NOT EXISTS books_isbn_unique
    ON books (isbn)
    WHERE isbn IS NOT NULL
  `;
  await db`
    ALTER TABLE children
    ADD COLUMN IF NOT EXISTS can_self_purchase boolean NOT NULL DEFAULT false
  `;
  await db`
    ALTER TABLE children
    ADD COLUMN IF NOT EXISTS can_browse_adult boolean NOT NULL DEFAULT false
  `;
  await db`
    ALTER TABLE children
    ADD COLUMN IF NOT EXISTS pin_hash text
  `;
  await db`
    ALTER TABLE children
    ADD COLUMN IF NOT EXISTS show_reward_codes boolean NOT NULL DEFAULT false
  `;
  await db`
    ALTER TABLE classes
    ADD COLUMN IF NOT EXISTS code text
  `;
  await db`
    CREATE UNIQUE INDEX IF NOT EXISTS classes_code_unique
    ON classes (code)
    WHERE code IS NOT NULL
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
  await db`
    CREATE TABLE IF NOT EXISTS book_purchases (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      child_id uuid REFERENCES children(id) ON DELETE SET NULL,
      book_id uuid REFERENCES books(id) ON DELETE SET NULL,
      isbn text,
      price_cents integer NOT NULL,
      purchased_by text NOT NULL CHECK (purchased_by IN ('parent', 'self')),
      source text NOT NULL DEFAULT 'gutenberg',
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await db`
    CREATE TABLE IF NOT EXISTS kid_game_accounts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      child_id uuid REFERENCES children(id) ON DELETE CASCADE,
      provider text NOT NULL,
      identifier text NOT NULL,
      created_at timestamptz DEFAULT now(),
      UNIQUE (child_id, provider)
    )
  `;
  await db`
    CREATE TABLE IF NOT EXISTS kid_game_requests (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      child_id uuid REFERENCES children(id) ON DELETE CASCADE,
      provider text NOT NULL,
      identifier text NOT NULL,
      status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
      created_at timestamptz DEFAULT now()
    )
  `;
  await db`
    CREATE TABLE IF NOT EXISTS reward_releases (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      reward_id uuid REFERENCES rewards(id) ON DELETE CASCADE,
      child_id uuid REFERENCES children(id) ON DELETE CASCADE,
      provider text NOT NULL,
      identifier text NOT NULL,
      face_value text NOT NULL,
      status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'unmatched')),
      created_at timestamptz DEFAULT now(),
      sent_at timestamptz,
      UNIQUE (reward_id)
    )
  `;
  await db`
    ALTER TABLE reward_releases
    ADD COLUMN IF NOT EXISTS code text
  `;
  await db`
    CREATE TABLE IF NOT EXISTS kid_sign_in_attempts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      key text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await db`
    CREATE INDEX IF NOT EXISTS kid_sign_in_attempts_key_created
    ON kid_sign_in_attempts (key, created_at)
  `;
}
