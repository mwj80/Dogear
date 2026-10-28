import { sql } from "./db";

type RewardRow = {
  id: string;
  household_id: string;
  cost_cents: number;
  face_value: string;
  criteria_type: string;
  scope: string;
  book_id: string | null;
  criteria_json: { pages?: number; mode?: string } | string | null;
};

function criteriaOf(reward: RewardRow) {
  const json =
    typeof reward.criteria_json === "string"
      ? (JSON.parse(reward.criteria_json) as { pages?: number; mode?: string })
      : reward.criteria_json;
  return {
    pages: Number(json?.pages ?? 0),
    mode: json?.mode === "read" ? "read" : "reach"
  };
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

  const readRows = await db`
    SELECT book_id, COALESCE(SUM(pages), 0)::int AS pages
    FROM page_log
    WHERE child_id = ${childId}::uuid
    GROUP BY book_id
  `;
  const readByBook = new Map<string, number>();
  let readAcross = 0;
  for (const entry of readRows as { book_id: string; pages: number }[]) {
    const pages = Number(entry.pages);
    readByBook.set(entry.book_id, pages);
    readAcross += pages;
  }
  const readThis = readByBook.get(bookId) ?? 0;

  const rewards = await db`
    SELECT id, household_id, cost_cents, face_value, criteria_type, scope, book_id, criteria_json
    FROM rewards
    WHERE child_id = ${childId}::uuid
      AND status = 'active'
      AND criteria_type IN ('finish_book', 'total_pages')
      AND (book_id = ${bookId}::uuid OR scope = 'any')
  `;

  const unlocked: { id: string; face_value: string }[] = [];

  for (const reward of rewards as RewardRow[]) {
    const { pages, mode } = criteriaOf(reward);
    let met = false;
    if (reward.scope === "any") {
      met = mode === "read" && pages > 0 && readAcross >= pages;
    } else if (reward.criteria_type === "finish_book") {
      met = finished;
    } else if (mode === "read") {
      met = pages > 0 && readThis >= pages;
    } else {
      met = pages > 0 && maxLoc >= pages;
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
        ? "Read-any-book unlock"
        : reward.criteria_type === "finish_book"
          ? "Finish-book unlock"
          : mode === "read"
            ? "Read-pages unlock"
            : "Reach-page unlock";

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
