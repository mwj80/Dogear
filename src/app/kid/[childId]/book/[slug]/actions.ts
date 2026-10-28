"use server";

import { sql } from "@/lib/db";
import { checkFinishBookUnlocks } from "@/lib/check-unlocks";
import { recordPages } from "@/lib/page-log";

export async function saveProgress(input: {
  childId: string;
  bookId: string;
  maxLocation: number;
  totalLocations: number;
}) {
  const db = sql();
  const prior = await db`
    SELECT max_location
    FROM progress
    WHERE child_id = ${input.childId}::uuid AND book_id = ${input.bookId}::uuid
    LIMIT 1
  `;
  const previousMax = Number(
    (prior[0] as { max_location: number } | undefined)?.max_location ?? 0
  );

  await db`
    INSERT INTO progress (child_id, book_id, max_location, total_locations, updated_at)
    VALUES (
      ${input.childId}::uuid,
      ${input.bookId}::uuid,
      ${input.maxLocation},
      ${input.totalLocations},
      now()
    )
    ON CONFLICT (child_id, book_id) DO UPDATE SET
      max_location = GREATEST(progress.max_location, EXCLUDED.max_location),
      total_locations = EXCLUDED.total_locations,
      updated_at = now()
  `;

  const stored = await db`
    SELECT max_location
    FROM progress
    WHERE child_id = ${input.childId}::uuid AND book_id = ${input.bookId}::uuid
    LIMIT 1
  `;
  const newMax = Number(
    (stored[0] as { max_location: number } | undefined)?.max_location ?? input.maxLocation
  );
  await recordPages({
    childId: input.childId,
    bookId: input.bookId,
    previousMax,
    newMax
  });

  return checkFinishBookUnlocks(input.childId, input.bookId);
}
