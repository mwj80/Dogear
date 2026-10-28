import { sql } from "./db";
import { ensurePageLog } from "./page-log";

type RewardRow = {
  id: string;
  household_id: string;
  cost_cents: number;
  face_value: string;
  criteria_type: string;
  scope: string;
  book_id: string | null;
  criteria_json: { pages?: number; days?: number; mode?: string } | string | null;
};

function criteriaOf(reward: RewardRow) {
  const json =
    typeof reward.criteria_json === "string"
      ? (JSON.parse(reward.criteria_json) as {
          pages?: number;
          days?: number;
          mode?: string;
        })
      : reward.criteria_json;
  const mode =
    reward.scope === "any" || json?.mode === "read" ? "read" : "reach";
  return {
    pages: Number(json?.pages ?? 0),
    days: Number(json?.days ?? 0),
    mode
  };
}

export function streakEndingToday(
  byDay: Map<string, number>,
  today: string,
  perDay: number
) {
  const cursor = new Date(`${today}T00:00:00Z`);
  if ((byDay.get(today) ?? 0) < perDay) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  let streak = 0;
  while (true) {
    const key = cursor.toISOString().slice(0, 10);
    if ((byDay.get(key) ?? 0) < perDay) break;
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

async function spendAndUnlock(reward: RewardRow, note: string) {
  const db = sql();
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
      ${note}
    )
  `;
  await db`
    UPDATE rewards
    SET status = 'unlocked',
        unlocked_at = now(),
        shortfall_cents = ${shortfall}
    WHERE id = ${reward.id}::uuid AND status = 'active'
  `;
}

export async function checkUnlocks(
  childId: string,
  bookId: string
): Promise<{ id: string; face_value: string }[]> {
  const db = sql();
  await ensurePageLog();
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

  const todayRow = await db`SELECT CURRENT_DATE::text AS today`;
  const today = String((todayRow[0] as { today: string }).today);

  const readRows = await db`
    SELECT book_id::text AS book_id, COALESCE(SUM(pages), 0)::int AS pages
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

  const dayRows = await db`
    SELECT day::text AS day, book_id::text AS book_id, SUM(pages)::int AS pages
    FROM page_log
    WHERE child_id = ${childId}::uuid
    GROUP BY day, book_id
  `;
  const thisByDay = new Map<string, number>();
  const anyByDay = new Map<string, number>();
  for (const entry of dayRows as { day: string; book_id: string; pages: number }[]) {
    const pages = Number(entry.pages);
    anyByDay.set(entry.day, (anyByDay.get(entry.day) ?? 0) + pages);
    if (entry.book_id === bookId) thisByDay.set(entry.day, pages);
  }

  const rewards = await db`
    SELECT id, household_id, cost_cents, face_value, criteria_type, scope, book_id, criteria_json
    FROM rewards
    WHERE child_id = ${childId}::uuid
      AND status = 'active'
      AND criteria_type IN ('finish_book', 'total_pages', 'daily_streak')
      AND (book_id = ${bookId}::uuid OR scope = 'any')
    ORDER BY (criteria_json->>'pages')::int NULLS LAST, created_at
  `;

  const unlocked: { id: string; face_value: string }[] = [];

  for (const reward of rewards as RewardRow[]) {
    const { pages, days, mode } = criteriaOf(reward);
    let met = false;
    if (reward.criteria_type === "daily_streak") {
      const source = reward.scope === "any" ? anyByDay : thisByDay;
      met = pages > 0 && days > 0 && streakEndingToday(source, today, pages) >= days;
    } else if (reward.scope === "any") {
      met = pages > 0 && readAcross >= pages;
    } else if (reward.criteria_type === "finish_book") {
      met = finished;
    } else if (mode === "read") {
      met = pages > 0 && readThis >= pages;
    } else {
      met = pages > 0 && maxLoc >= pages;
    }
    if (!met) continue;

    const note =
      reward.criteria_type === "daily_streak"
        ? "Daily-streak unlock"
        : reward.scope === "any"
          ? "Read-any-book unlock"
          : reward.criteria_type === "finish_book"
            ? "Finish-book unlock"
            : mode === "read"
              ? "Read-pages unlock"
              : "Reach-page unlock";
    await spendAndUnlock(reward, note);
    unlocked.push({ id: reward.id, face_value: reward.face_value });
  }
  return unlocked;
}

/** Recheck every active reward for a household. Heals rewards that already met their goal. */
export async function recheckHousehold(householdId: string) {
  const db = sql();
  const kids = await db`
    SELECT id FROM children WHERE household_id = ${householdId}::uuid
  `;
  for (const kid of kids as { id: string }[]) {
    const books = await db`
      SELECT book_id FROM progress WHERE child_id = ${kid.id}::uuid
    `;
    for (const book of books as { book_id: string }[]) {
      await checkUnlocks(kid.id, book.book_id);
    }
  }
}

/** @deprecated use checkUnlocks */
export const checkFinishBookUnlocks = checkUnlocks;
