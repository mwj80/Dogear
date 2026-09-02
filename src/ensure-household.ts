import { sql } from "./db";

export async function ensureHousehold(opts: {
  clerkUserId: string;
  email: string;
}) {
  const db = sql();

  const found = await db`
    SELECT u.id AS user_id, h.id AS household_id, h.pot_available_cents
    FROM users u
    JOIN households h ON h.parent_user_id = u.id
    WHERE u.clerk_user_id = ${opts.clerkUserId}
    LIMIT 1
  `;

  if (found[0]) {
    return found[0] as {
      user_id: string;
      household_id: string;
      pot_available_cents: number;
    };
  }

  const userRows = await db`
    INSERT INTO users (email, clerk_user_id, is_parent)
    VALUES (${opts.email}, ${opts.clerkUserId}, true)
    ON CONFLICT (clerk_user_id) DO UPDATE SET email = EXCLUDED.email
    RETURNING id
  `;
  const userId = userRows[0].id as string;

  const householdRows = await db`
    SELECT id AS household_id, pot_available_cents
    FROM households
    WHERE parent_user_id = ${userId}::uuid
    LIMIT 1
  `;

  if (householdRows[0]) {
    return {
      user_id: userId,
      household_id: householdRows[0].household_id as string,
      pot_available_cents: householdRows[0].pot_available_cents as number
    };
  }

  const created = await db`
    INSERT INTO households (parent_user_id)
    VALUES (${userId}::uuid)
    RETURNING id AS household_id, pot_available_cents
  `;

  return {
    user_id: userId,
    household_id: created[0].household_id as string,
    pot_available_cents: created[0].pot_available_cents as number
  };
}
