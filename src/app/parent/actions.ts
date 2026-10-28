"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { ensureHousehold } from "@/lib/ensure-household";
import { ensurePageLog } from "@/lib/page-log";

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
  const scope = String(formData.get("scope") ?? "book") === "any" ? "any" : "book";
  let goal = String(formData.get("goal") ?? "reach");
  const pages = Number(formData.get("pages") ?? 0);
  const days = Number(formData.get("days") ?? 0);
  if (!childId || !faceValue) {
    throw new Error("Kid and reward value are required");
  }
  if (scope === "any" && (goal === "reach" || goal === "finish")) goal = "read";
  if (scope === "book" && !bookId) {
    throw new Error("Pick a book for a this-book reward");
  }
  if (goal !== "finish" && (!pages || pages < 1)) {
    throw new Error("Enter a page count of at least 1");
  }
  if (goal === "streak" && (!days || days < 1)) {
    throw new Error("Enter at least 1 day for a streak");
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
  if (!rates) throw new Error("Admin rates are not configured");
  const { costCents } = await import("@/lib/rates");
  const cost = costCents({
    rewardType,
    faceValue,
    robuxPer100: Number(rates.robux_dollars_per_100),
    giftMultiplier: Number(rates.gift_multiplier),
    pizzaFixed: Number(rates.pizza_fixed_dollars),
    customDefault: Number(rates.custom_default_dollars)
  });

  const type =
    goal === "finish" ? "finish_book" : goal === "streak" ? "daily_streak" : "total_pages";
  const criteriaJson =
    goal === "finish"
      ? "{}"
      : goal === "streak"
        ? JSON.stringify({ pages, days })
        : JSON.stringify({ pages, mode: goal });

  if (scope === "any") {
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
        'any',
        NULL,
        ${type},
        ${criteriaJson}::jsonb,
        'active'
      )
    `;
  } else {
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
        ${type},
        ${criteriaJson}::jsonb,
        'active'
      )
    `;
  }
  revalidatePath("/parent");
}

/** Resets this household to a mid-book test state. */
export async function resetDemo() {
  const { userId } = await auth();
  if (!userId) throw new Error("Not signed in");

  const user = await currentUser();
  const email =
    user?.primaryEmailAddress?.emailAddress ?? `${userId}@users.invalid`;
  const household = await ensureHousehold({ clerkUserId: userId, email });
  const db = sql();
  const hid = household.household_id;
  await ensurePageLog();

  await db`
    UPDATE progress p
    SET max_location = LEAST(5, GREATEST(COALESCE(p.total_locations, 1) - 1, 0)),
        updated_at = now()
    FROM children c
    WHERE p.child_id = c.id
      AND c.household_id = ${hid}::uuid
  `;

  await db`
    DELETE FROM page_log pl
    USING children c
    WHERE pl.child_id = c.id
      AND c.household_id = ${hid}::uuid
  `;

  await db`
    INSERT INTO page_log (child_id, book_id, day, pages)
    SELECT p.child_id, p.book_id, CURRENT_DATE - 2, 5
    FROM progress p
    JOIN children c ON c.id = p.child_id
    WHERE c.household_id = ${hid}::uuid
    UNION ALL
    SELECT p.child_id, p.book_id, CURRENT_DATE - 1, 5
    FROM progress p
    JOIN children c ON c.id = p.child_id
    WHERE c.household_id = ${hid}::uuid
  `;

  await db`
    UPDATE rewards
    SET status = 'active',
        unlocked_at = NULL,
        shortfall_cents = 0
    WHERE household_id = ${hid}::uuid
  `;

  await db`
    UPDATE households
    SET pot_available_cents = 2000
    WHERE id = ${hid}::uuid
  `;

  revalidatePath("/parent");
  revalidatePath("/kid");
}
