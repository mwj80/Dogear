"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { ensureSchema } from "@/lib/ensure-schema";
import { assertKidAccess } from "@/lib/kid-auth";

export async function joinClassAsKid(formData: FormData) {
  const childId = String(formData.get("child_id") ?? "");
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  if (!childId || !code) {
    redirect(`/kid/${childId}?join=missing`);
  }
  await assertKidAccess(childId);
  await ensureSchema();
  const db = sql();

  const classes = await db`
    SELECT id, name FROM classes WHERE code = ${code} LIMIT 1
  `;
  if (!classes[0]) {
    redirect(`/kid/${childId}?join=bad`);
  }
  const klass = classes[0] as { id: string; name: string };

  const kids = await db`
    SELECT id, display_name, household_id
    FROM children WHERE id = ${childId}::uuid LIMIT 1
  `;
  if (!kids[0]) {
    redirect(`/kid/${childId}?join=bad`);
  }
  const kid = kids[0] as { id: string; display_name: string; household_id: string };

  await db`
    INSERT INTO enrollments (class_id, child_id)
    VALUES (${klass.id}::uuid, ${kid.id}::uuid)
    ON CONFLICT DO NOTHING
  `;

  // Give the kid the assignment books so they can read them
  const books = await db`
    SELECT DISTINCT book_id FROM assignments WHERE class_id = ${klass.id}::uuid
  `;
  for (const b of books as { book_id: string }[]) {
    await db`
      INSERT INTO kid_books (child_id, book_id, purchased_by)
      VALUES (${kid.id}::uuid, ${b.book_id}::uuid, 'self')
      ON CONFLICT DO NOTHING
    `;
  }

  if (kid.household_id) {
    await db`
      INSERT INTO parent_notices (household_id, message)
      VALUES (
        ${kid.household_id}::uuid,
        ${`${kid.display_name} joined the class “${klass.name}” using the class code.`}
      )
    `;
  }

  revalidatePath("/teacher");
  revalidatePath("/parent");
  revalidatePath(`/kid/${childId}`);
  redirect(`/kid/${childId}?join=ok&class=${encodeURIComponent(klass.name)}`);
}

export async function dismissNotice(formData: FormData) {
  const noticeId = String(formData.get("notice_id") ?? "");
  if (!noticeId) return;
  const db = sql();
  await db`
    UPDATE parent_notices SET dismissed = true WHERE id = ${noticeId}::uuid
  `;
  revalidatePath("/parent");
}
