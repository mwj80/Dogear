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

export async function loadPot(formData: FormData) {
  const { userId } = await auth();
  if (!userId) throw new Error("Not signed in");
  const dollars = Number(formData.get("dollars"));
  if (!dollars || dollars <= 0) throw new Error("Enter a positive amount");
  const cents = Math.round(dollars * 100);

  const user = await currentUser();
  const email =
    user?.primaryEmailAddress?.emailAddress ?? `${userId}@users.invalid`;
  const household = await ensureHousehold({ clerkUserId: userId, email });
  const db = sql();

  await db`
    UPDATE households
    SET pot_available_cents = pot_available_cents + ${cents},
        pot_loaded_cents = pot_loaded_cents + ${cents}
    WHERE id = ${household.household_id}::uuid
  `;
  await db`
    INSERT INTO ledger (household_id, kind, amount_cents, note)
    VALUES (${household.household_id}::uuid, 'load', ${cents}, 'Parent load')
  `;
  revalidatePath("/parent");
}

export async function createFinishReward(formData: FormData) {
  const { userId } = await auth();
  if (!userId) throw new Error("Not signed in");

  const childId = String(formData.get("child_id") ?? "");
  const bookId = String(formData.get("book_id") ?? "");
  const rewardType = String(formData.get("reward_type") ?? "robux") as
    | "robux"
    | "gift_card"
    | "pizza"
    | "custom";
  const faceValue = String(formData.get("face_value") ?? "").trim();
  if (!childId || !bookId || !faceValue) {
    throw new Error("Kid, book, and reward value are required");
  }

  const user = await currentUser();
  const email =
    user?.primaryEmailAddress?.emailAddress ?? `${userId}@users.invalid`;
  const household = await ensureHousehold({ clerkUserId: userId, email });
  const db = sql();

  const child = await db`
    SELECT id FROM children
    WHERE id = ${childId}::uuid AND household_id = ${household.household_id}::uuid
  `;
  if (!child[0]) throw new Error("Kid not in this household");

  const ratesRows = await db`SELECT * FROM admin_rates LIMIT 1`;
  const rates = ratesRows[0] as {
    robux_dollars_per_100: string;
    gift_multiplier: string;
    pizza_fixed_dollars: string;
    custom_default_dollars: string;
  };
  const { costCents } = await import("@/lib/rates");
  const cost = costCents({
    rewardType,
    faceValue,
    robuxPer100: Number(rates.robux_dollars_per_100),
    giftMultiplier: Number(rates.gift_multiplier),
    pizzaFixed: Number(rates.pizza_fixed_dollars),
    customDefault: Number(rates.custom_default_dollars)
  });

  await db`
    INSERT INTO rewards (
      household_id, child_id, reward_type, face_value, cost_cents,
      scope, book_id, criteria_type, criteria_json, status
    )
    VALUES (
      ${household.household_id}::uuid,
      ${childId}::uuid,
      ${rewardType},
      ${faceValue},
      ${cost},
      'book',
      ${bookId}::uuid,
      'finish_book',
      '{}'::jsonb,
      'active'
    )
  `;
  revalidatePath("/parent");
}
