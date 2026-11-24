import { sql } from "./db";

export async function ensureUser(opts: {
  clerkUserId: string;
  email: string;
}) {
  const db = sql();

  const found = await db`
    SELECT id, is_parent, is_teacher
    FROM users
    WHERE clerk_user_id = ${opts.clerkUserId}
    LIMIT 1
  `;

  if (found[0]) {
    return found[0] as {
      id: string;
      is_parent: boolean;
      is_teacher: boolean;
    };
  }

  const created = await db`
    INSERT INTO users (email, clerk_user_id)
    VALUES (${opts.email}, ${opts.clerkUserId})
    ON CONFLICT (clerk_user_id) DO UPDATE SET email = EXCLUDED.email
    RETURNING id, is_parent, is_teacher
  `;

  return created[0] as {
    id: string;
    is_parent: boolean;
    is_teacher: boolean;
  };
}
