"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { ensureHousehold } from "@/lib/ensure-household";

async function householdOfUser() {
  const { userId } = await auth();
  if (!userId) throw new Error("Not signed in");
  const user = await currentUser();
  const email =
    user?.primaryEmailAddress?.emailAddress ?? `${userId}@users.invalid`;
  return ensureHousehold({ clerkUserId: userId, email });
}

export async function setDailyGoal(formData: FormData) {
  const { userId } = await auth();
  if (!userId) throw new Error("Not signed in");
  const childId = String(formData.get("child_id") ?? "");
  const pages = Number(formData.get("pages") ?? 0);
  if (!childId || !pages || pages < 1) throw new Error("Enter at least 1 page");

  const user = await currentUser();
  const email =
    user?.primaryEmailAddress?.emailAddress ?? `${userId}@users.invalid`;
  const household = await ensureHousehold({ clerkUserId: userId, email });
  const db = sql();

  await db`
    UPDATE children
    SET daily_goal_pages = ${pages}
    WHERE id = ${childId}::uuid AND household_id = ${household.household_id}::uuid
  `;

  revalidatePath("/parent");
  revalidatePath(`/parent/kid/${childId}`);
}

export async function removeKid(formData: FormData) {
  const household = await householdOfUser();
  const childId = String(formData.get("child_id") ?? "");
  if (!childId) throw new Error("Missing kid");
  const db = sql();

  const kids = await db`
    SELECT id FROM children
    WHERE id = ${childId}::uuid AND household_id = ${household.household_id}::uuid
    LIMIT 1
  `;
  if (!kids[0]) throw new Error("Kid not in this household");

  await db`
    UPDATE ledger
    SET reward_id = NULL
    WHERE household_id = ${household.household_id}::uuid
      AND reward_id IN (
        SELECT id FROM rewards WHERE child_id = ${childId}::uuid
      )
  `;
  await db`
    DELETE FROM children
    WHERE id = ${childId}::uuid AND household_id = ${household.household_id}::uuid
  `;

  revalidatePath("/parent");
  revalidatePath("/kid");
  redirect("/parent");
}
