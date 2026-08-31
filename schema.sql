-- Phase 1 Postgres schema
-- Money is integer cents. IDs are UUIDs.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  is_admin      BOOLEAN NOT NULL DEFAULT FALSE,
  is_parent     BOOLEAN NOT NULL DEFAULT TRUE,
  is_teacher    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE households (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pot_available_cents INTEGER NOT NULL DEFAULT 0,
  pot_loaded_cents    INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE children (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id      UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  display_name      TEXT NOT NULL,
  daily_goal_pages  INTEGER NOT NULL DEFAULT 5,
  timezone          TEXT NOT NULL DEFAULT 'America/New_York',
  pin_hash          TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE admin_rates (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  robux_dollars_per_100   NUMERIC(8,4) NOT NULL DEFAULT 0.75,
  gift_multiplier         NUMERIC(8,4) NOT NULL DEFAULT 1.10,
  pizza_fixed_dollars     NUMERIC(8,2) NOT NULL DEFAULT 4.00,
  custom_default_dollars  NUMERIC(8,2) NOT NULL DEFAULT 5.00,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE books (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL,
  author          TEXT NOT NULL,
  slug            TEXT UNIQUE NOT NULL,
  epub_path       TEXT NOT NULL,
  chars_per_page  INTEGER NOT NULL DEFAULT 700,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE progress (
  child_id          UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  book_id           UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  max_location      INTEGER NOT NULL DEFAULT 0,
  total_locations   INTEGER NOT NULL DEFAULT 0,
  seconds_reading   INTEGER NOT NULL DEFAULT 0,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (child_id, book_id)
);

CREATE TABLE daily_pages (
  child_id  UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  date      DATE NOT NULL,
  pages     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (child_id, date)
);

CREATE TABLE rewards (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id   UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  child_id       UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  reward_type    TEXT NOT NULL CHECK (reward_type IN ('robux', 'gift_card', 'pizza', 'custom')),
  face_value     TEXT NOT NULL,
  cost_cents     INTEGER NOT NULL,
  scope          TEXT NOT NULL CHECK (scope IN ('any', 'book')),
  book_id        UUID REFERENCES books(id),
  criteria_type  TEXT NOT NULL CHECK (criteria_type IN ('finish_book', 'total_pages', 'daily_streak')),
  criteria_json  JSONB NOT NULL DEFAULT '{}',
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'unlocked')),
  unlocked_at    TIMESTAMPTZ,
  shortfall_cents INTEGER,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ledger (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id   UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL CHECK (kind IN ('load', 'spend')),
  amount_cents   INTEGER NOT NULL,
  reward_id      UUID REFERENCES rewards(id),
  note           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE classes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE enrollments (
  class_id  UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  child_id  UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  PRIMARY KEY (class_id, child_id)
);

CREATE TABLE assignments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id       UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  book_id        UUID NOT NULL REFERENCES books(id),
  criteria_type  TEXT NOT NULL CHECK (criteria_type IN ('finish_book', 'total_pages')),
  criteria_json  JSONB NOT NULL DEFAULT '{}',
  due_date       DATE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
