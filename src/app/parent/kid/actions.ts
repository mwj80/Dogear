"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { ensureHousehold } from "@/lib/ensure-household";

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
