"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { ensureHousehold } from "@/lib/ensure-household";

export async function createChild(formData: FormData) {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("Not signed in");
  }

  const name = String(formData.get("display_name") ?? "").trim();
  if (!name) {
    throw new Error("Name is required");
  }

  const user = await currentUser();
  const email =
    user?.primaryEmailAddress?.emailAddress ?? `${userId}@users.invalid`;
  const household = await ensureHousehold({ clerkUserId: userId, email });

  await sql()`
    INSERT INTO children (household_id, display_name)
    VALUES (${household.household_id}::uuid, ${name})
  `;

  revalidatePath("/parent");
}
