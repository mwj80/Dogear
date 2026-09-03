"use server";

import { sql } from "@/lib/db";
import { checkFinishBookUnlocks } from "@/lib/check-unlocks";

export async function saveProgress(input: {
  childId: string;
  bookId: string;
  maxLocation: number;
  totalLocations: number;
}) {
  const db = sql();
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
  await checkFinishBookUnlocks(input.childId, input.bookId);
}
