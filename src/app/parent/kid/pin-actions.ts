"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { ensureHousehold } from "@/lib/ensure-household";
import { ensureSchema } from "@/lib/ensure-schema";
import { hashPin } from "@/lib/kid-auth";

export async function setKidPin(formData: FormData) {
  const { userId } = await auth();
  if (!userId) throw new Error("Not signed in");

  const childId = String(formData.get("child_id") ?? "");
  const pin = String(formData.get("pin") ?? "").trim();
  if (!childId || !/^\d{4}$/.test(pin)) throw new Error("Enter a 4-digit PIN");

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? `${userId}@users.invalid`;
  const household = await ensureHousehold({ clerkUserId: userId, email });
  const db = sql();
  await ensureSchema();

  const rows = await db`
    SELECT display_name FROM children
    WHERE id = ${childId}::uuid AND household_id = ${household.household_id}::uuid
    LIMIT 1
  `;
  const name = String((rows[0] as { display_name: string } | undefined)?.display_name ?? "");
  if (!name) throw new Error("Kid not found");

  await db`
    UPDATE children
    SET pin_hash = ${hashPin(pin)}
    WHERE id = ${childId}::uuid AND household_id = ${household.household_id}::uuid
  `;

  revalidatePath("/parent/kid/new");
  redirect(`/parent/kid/new?pin=set&name=${encodeURIComponent(name)}`);
}
