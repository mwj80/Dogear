import { sql } from "./db";

export async function checkFinishBookUnlocks(childId: string, bookId: string) {
  const db = sql();
  const progress = await db`
    SELECT max_location, total_locations
    FROM progress
    WHERE child_id = ${childId}::uuid AND book_id = ${bookId}::uuid
    LIMIT 1
  `;
  const row = progress[0] as
    | { max_location: number; total_locations: number }
    | undefined;
  if (!row || !row.total_locations) return;

  const done = Number(row.max_location) >= Number(row.total_locations) - 1;
  if (!done) return;

  const rewards = await db`
    SELECT id, household_id, cost_cents
    FROM rewards
    WHERE child_id = ${childId}::uuid
      AND status = 'active'
      AND criteria_type = 'finish_book'
      AND (book_id = ${bookId}::uuid OR scope = 'book')
      AND book_id = ${bookId}::uuid
  `;

  for (const reward of rewards as {
    id: string;
    household_id: string;
    cost_cents: number;
  }[]) {
    const house = await db`
      SELECT pot_available_cents
      FROM households
      WHERE id = ${reward.household_id}::uuid
    `;
    const available = Number(
      (house[0] as { pot_available_cents: number } | undefined)
        ?.pot_available_cents ?? 0
    );
    const cost = Number(reward.cost_cents);
    const shortfall = Math.max(0, cost - available);
    const spend = Math.min(available, cost);

    await db`
      UPDATE households
      SET pot_available_cents = pot_available_cents - ${spend}
      WHERE id = ${reward.household_id}::uuid
    `;
    await db`
      INSERT INTO ledger (household_id, kind, amount_cents, reward_id, note)
      VALUES (
        ${reward.household_id}::uuid,
        'spend',
        ${spend},
        ${reward.id}::uuid,
        'Finish-book unlock'
      )
    `;
    await db`
      UPDATE rewards
      SET status = 'unlocked',
          unlocked_at = now(),
          shortfall_cents = ${shortfall}
      WHERE id = ${reward.id}::uuid
    `;
  }
}
