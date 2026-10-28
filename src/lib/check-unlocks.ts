import { sql } from "./db";

type RewardRow = {
  id: string;
  household_id: string;
  cost_cents: number;
  face_value: string;
  criteria_type: string;
  scope: string;
  criteria_json: { pages?: number } | string | null;
};

function pagesNeeded(reward: RewardRow) {
  const json =
    typeof reward.criteria_json === "string"
      ? (JSON.parse(reward.criteria_json) as { pages?: number })
      : reward.criteria_json;
  return Number(json?.pages ?? 0);
}

export async function checkUnlocks(
  childId: string,
  bookId: string
): Promise<{ id: string; face_value: string }[]> {
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
  if (!row) return [];

  const maxLoc = Number(row.max_location);
  const total = Number(row.total_locations);
  const finished = total > 0 && maxLoc >= total - 1;

  const allProgress = await db`
    SELECT max_location, total_locations
    FROM progress
    WHERE child_id = ${childId}::uuid
  `;
  const totals = allProgress as {
    max_location: number;
    total_locations: number;
  }[];
  const acrossPages = totals.reduce((n, p) => n + Number(p.max_location), 0);
  const anyFinished = totals.some(
    (p) =>
      Number(p.total_locations) > 0 &&
      Number(p.max_location) >= Number(p.total_locations) - 1
  );

  const rewards = await db`
    SELECT id, household_id, cost_cents, face_value, criteria_type, scope, criteria_json
    FROM rewards
    WHERE child_id = ${childId}::uuid
      AND status = 'active'
      AND criteria_type IN ('finish_book', 'total_pages')
      AND (book_id = ${bookId}::uuid OR scope = 'any')
  `;

  const unlocked: { id: string; face_value: string }[] = [];

  for (const reward of rewards as RewardRow[]) {
    let met = false;
    if (reward.scope === "any") {
      if (reward.criteria_type === "finish_book") {
        met = anyFinished;
      } else if (reward.criteria_type === "total_pages") {
        const need = pagesNeeded(reward);
        met = need > 0 && acrossPages >= need;
      }
    } else if (reward.criteria_type === "finish_book") {
      met = finished;
    } else if (reward.criteria_type === "total_pages") {
      const need = pagesNeeded(reward);
      met = need > 0 && maxLoc >= need;
    }
    if (!met) continue;

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
    const note =
      reward.scope === "any"
        ? "Any-book unlock"
        : reward.criteria_type === "total_pages"
          ? "Page-threshold unlock"
          : "Finish-book unlock";

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
        ${note}
      )
    `;
    await db`
      UPDATE rewards
      SET status = 'unlocked',
          unlocked_at = now(),
          shortfall_cents = ${shortfall}
      WHERE id = ${reward.id}::uuid
    `;
    unlocked.push({ id: reward.id, face_value: reward.face_value });
  }
  return unlocked;
}

/** @deprecated use checkUnlocks */
export const checkFinishBookUnlocks = checkUnlocks;
