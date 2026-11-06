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

export async function renameKid(formData: FormData) {
  const household = await householdOfUser();
  const childId = String(formData.get("child_id") ?? "");
  const name = String(formData.get("display_name") ?? "").trim();
  if (!childId || !name) throw new Error("Name is required");
  const db = sql();
  await db`
    UPDATE children
    SET display_name = ${name}
    WHERE id = ${childId}::uuid AND household_id = ${household.household_id}::uuid
  `;
  revalidatePath("/parent");
  revalidatePath("/teacher");
  revalidatePath(`/parent/kid/${childId}`);
  revalidatePath(`/kid/${childId}`);
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
  revalidatePath("/parent/kid/new");
  redirect("/parent/kid/new");
}

export async function addGameAccount(formData: FormData) {
  const household = await householdOfUser();
  const childId = String(formData.get("child_id") ?? "");
  const providerSelect = String(formData.get("provider") ?? "").trim();
  const otherLabel = String(formData.get("other_label") ?? "").trim();
  const identifier = String(formData.get("identifier") ?? "").trim();
  const provider = providerSelect === "other" ? otherLabel : providerSelect;
  if (!childId || !provider || !identifier) throw new Error("Game and identifier are required");

  const db = sql();
  const kids = await db`
    SELECT id, display_name FROM children
    WHERE id = ${childId}::uuid AND household_id = ${household.household_id}::uuid
    LIMIT 1
  `;
  if (!kids[0]) throw new Error("Kid not in this household");
  const name = String((kids[0] as { display_name: string }).display_name);

  await db`
    INSERT INTO kid_game_accounts (child_id, provider, identifier)
    VALUES (${childId}::uuid, ${provider}, ${identifier})
    ON CONFLICT (child_id, provider)
    DO UPDATE SET identifier = EXCLUDED.identifier
  `;

  revalidatePath("/parent");
  revalidatePath("/parent/kid/new");
  redirect(`/parent/kid/new?account=saved&name=${encodeURIComponent(name)}&game=${encodeURIComponent(provider)}`);
}

export async function removeGameAccount(formData: FormData) {
  const household = await householdOfUser();
  const accountId = String(formData.get("account_id") ?? "");
  if (!accountId) throw new Error("Missing account");
  const db = sql();
  await db`
    DELETE FROM kid_game_accounts a
    USING children c
    WHERE a.id = ${accountId}::uuid
      AND a.child_id = c.id
      AND c.household_id = ${household.household_id}::uuid
  `;
  revalidatePath("/parent");
  revalidatePath("/parent/kid/new");
  redirect("/parent/kid/new?account=removed");
}
