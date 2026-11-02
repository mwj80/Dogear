"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { ensureHousehold } from "@/lib/ensure-household";
import { ensurePageLog } from "@/lib/page-log";
import { costCents } from "@/lib/rates";
import { recheckHousehold } from "@/lib/check-unlocks";
import { ensureSchema } from "@/lib/ensure-schema";

async function householdOfUser() {
  const { userId } = await auth();
  if (!userId) throw new Error("Not signed in");
  const user = await currentUser();
  const email =
    user?.primaryEmailAddress?.emailAddress ?? `${userId}@users.invalid`;
  return ensureHousehold({ clerkUserId: userId, email });
}

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

export async function removeReward(formData: FormData) {
  const household = await householdOfUser();
  const rewardId = String(formData.get("reward_id") ?? "");
  if (!rewardId) throw new Error("Missing reward");
  const db = sql();
  await db`
    DELETE FROM rewards
    WHERE id = ${rewardId}::uuid
      AND household_id = ${household.household_id}::uuid
      AND status = 'active'
  `;
  revalidatePath("/parent");
  revalidatePath("/kid");
}

export async function updateReward(formData: FormData) {
  const household = await householdOfUser();
  const rewardId = String(formData.get("reward_id") ?? "");
  const faceValue = String(formData.get("face_value") ?? "").trim();
  const pages = Number(formData.get("pages") ?? 0);
  const days = Number(formData.get("days") ?? 0);
  if (!rewardId || !faceValue) throw new Error("Reward and value are required");

  const db = sql();
  const rows = await db`
    SELECT reward_type, scope, criteria_type
    FROM rewards
    WHERE id = ${rewardId}::uuid
      AND household_id = ${household.household_id}::uuid
      AND status = 'active'
    LIMIT 1
  `;
  const current = rows[0] as
    | { reward_type: "robux" | "gift_card" | "pizza" | "custom"; scope: string; criteria_type: string }
    | undefined;
  if (!current) throw new Error("Active reward not found");

  let goal = String(formData.get("goal") ?? "reach");
  if (current.scope === "any" && (goal === "reach" || goal === "finish")) goal = "read";
  if (goal !== "finish" && (!pages || pages < 1)) {
    throw new Error("Enter a page count of at least 1");
  }
  if (goal === "streak" && (!days || days < 1)) {
    throw new Error("Enter at least 1 day for a streak");
  }

  const ratesRows = await db`SELECT * FROM admin_rates LIMIT 1`;
  const rates = ratesRows[0] as {
    robux_dollars_per_100: string;
    gift_multiplier: string;
    pizza_fixed_dollars: string;
    custom_default_dollars: string;
  };
  if (!rates) throw new Error("Admin rates are not configured");
  const cost = costCents({
    rewardType: current.reward_type,
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

  await db`
    UPDATE rewards
    SET face_value = ${faceValue},
        cost_cents = ${cost},
        criteria_type = ${type},
        criteria_json = ${criteriaJson}::jsonb
    WHERE id = ${rewardId}::uuid
      AND household_id = ${household.household_id}::uuid
      AND status = 'active'
  `;
  revalidatePath("/parent");
  revalidatePath("/kid");
}

/** Resets this household to a mid-book test state with a representative reward set and a demo class. */
export async function resetDemo() {
  const { userId } = await auth();
  if (!userId) throw new Error("Not signed in");

  const user = await currentUser();
  const email =
    user?.primaryEmailAddress?.emailAddress ?? `${userId}@users.invalid`;
  const household = await ensureHousehold({ clerkUserId: userId, email });
  const db = sql();
  const hid = household.household_id;
  const uid = household.user_id;
  await ensurePageLog();
  await ensureSchema();

  // Reset progress and clear logs/rewards
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

  await db`DELETE FROM ledger WHERE household_id = ${hid}::uuid`;
  await db`DELETE FROM rewards WHERE household_id = ${hid}::uuid`;

  // Clean prior demo classes
  await db`
    DELETE FROM classes
    WHERE teacher_user_id = ${uid}::uuid AND name = 'Demo Reading Class'
  `;

  const ratesRows = await db`SELECT * FROM admin_rates LIMIT 1`;
  const rates = ratesRows[0] as {
    robux_dollars_per_100: string;
    gift_multiplier: string;
    pizza_fixed_dollars: string;
    custom_default_dollars: string;
  } | undefined;
  const kids = (await db`
    SELECT id FROM children WHERE household_id = ${hid}::uuid ORDER BY created_at
  `) as { id: string }[];
  const books = (await db`SELECT id FROM books ORDER BY title LIMIT 2`) as {
    id: string;
  }[];
  const bookId = books[0]?.id;
  const bookId2 = books[1]?.id ?? bookId;

  // Seed public-domain books if missing
  await db`
    INSERT INTO books (title, author, slug, price_cents, epub_path)
    VALUES
      ('Alice’s Adventures in Wonderland', 'Lewis Carroll', 'alice', 0, 'https://www.gutenberg.org/cache/epub/11/pg11.epub'),
      ('Pride and Prejudice', 'Jane Austen', 'pride', 50, 'https://www.gutenberg.org/cache/epub/1342/pg1342.epub'),
      ('The Adventures of Sherlock Holmes', 'Arthur Conan Doyle', 'sherlock', 0, 'https://www.gutenberg.org/cache/epub/1661/pg1661.epub'),
      ('Treasure Island', 'Robert Louis Stevenson', 'treasure', 50, 'https://www.gutenberg.org/cache/epub/120/pg120.epub'),
      ('Frankenstein', 'Mary Shelley', 'frankenstein', 0, 'https://www.gutenberg.org/cache/epub/84/pg84.epub')
    ON CONFLICT (slug) DO UPDATE SET
      price_cents = EXCLUDED.price_cents,
      epub_path = EXCLUDED.epub_path,
      title = EXCLUDED.title,
      author = EXCLUDED.author
  `;

  // Explicitly add free books (alice, sherlock) to each kid
  const freeBooks = await db`SELECT id FROM books WHERE slug IN ('alice', 'sherlock')`;
  for (const kid of kids) {
    for (const free of freeBooks as { id: string }[]) {
      await db`
        INSERT INTO kid_books (child_id, book_id, purchased_by)
        VALUES (${kid.id}::uuid, ${free.id}::uuid, 'parent')
        ON CONFLICT DO NOTHING
      `;
      await db`
        INSERT INTO progress (child_id, book_id, max_location, total_locations)
        VALUES (${kid.id}::uuid, ${free.id}::uuid, 0, 0)
        ON CONFLICT (child_id, book_id) DO NOTHING
      `;
    }
  }


  if (bookId) {
    await db`
      INSERT INTO page_log (child_id, book_id, day, pages)
      SELECT c.id, ${bookId}::uuid, CURRENT_DATE - 2, 5
      FROM children c
      WHERE c.household_id = ${hid}::uuid
      UNION ALL
      SELECT c.id, ${bookId}::uuid, CURRENT_DATE - 1, 5
      FROM children c
      WHERE c.household_id = ${hid}::uuid
    `;
  }

  if (rates && bookId) {
    const robuxPer100 = Number(rates.robux_dollars_per_100);
    const giftMultiplier = Number(rates.gift_multiplier);
    const pizzaFixed = Number(rates.pizza_fixed_dollars);
    const customDefault = Number(rates.custom_default_dollars);
    const samples = [
      {
        type: "robux" as const,
        face: "400 Robux",
        scope: "book",
        criteria: "total_pages",
        json: JSON.stringify({ pages: 20, mode: "reach" })
      },
      {
        type: "gift_card" as const,
        face: "$5",
        scope: "book",
        criteria: "total_pages",
        json: JSON.stringify({ pages: 15, mode: "read" })
      },
      {
        type: "pizza" as const,
        face: "Personal pan pizza",
        scope: "book",
        criteria: "finish_book",
        json: "{}"
      },
      {
        type: "robux" as const,
        face: "800 Robux",
        scope: "any",
        criteria: "total_pages",
        json: JSON.stringify({ pages: 25, mode: "read" })
      },
      {
        type: "gift_card" as const,
        face: "$10",
        scope: "any",
        criteria: "daily_streak",
        json: JSON.stringify({ pages: 5, days: 3 })
      }
    ];

    for (const kid of kids) {
      for (const sample of samples) {
        const cost = costCents({
          rewardType: sample.type,
          faceValue: sample.face,
          robuxPer100,
          giftMultiplier,
          pizzaFixed,
          customDefault
        });
        if (sample.scope === "any") {
          await db`
            INSERT INTO rewards (
              household_id, child_id, reward_type, face_value, cost_cents,
              scope, book_id, criteria_type, criteria_json, status
            )
            VALUES (
              ${hid}::uuid,
              ${kid.id}::uuid,
              ${sample.type},
              ${sample.face},
              ${cost},
              'any',
              NULL,
              ${sample.criteria},
              ${sample.json}::jsonb,
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
              ${hid}::uuid,
              ${kid.id}::uuid,
              ${sample.type},
              ${sample.face},
              ${cost},
              'book',
              ${bookId}::uuid,
              ${sample.criteria},
              ${sample.json}::jsonb,
              'active'
            )
          `;
        }
      }
    }
  }

  // Seed demo class with mixed assignments
  if (kids.length > 0 && bookId) {
    const classRows = await db`
      INSERT INTO classes (teacher_user_id, name)
      VALUES (${uid}::uuid, 'Demo Reading Class')
      RETURNING id
    `;
    const classId = (classRows[0] as { id: string }).id;

    for (const kid of kids) {
      await db`
        INSERT INTO enrollments (class_id, child_id)
        VALUES (${classId}::uuid, ${kid.id}::uuid)
        ON CONFLICT DO NOTHING
      `;
    }

    // Assignments: overdue finish (some done), future pages, overdue pages
    await db`
      INSERT INTO assignments (class_id, title, book_id, criteria_type, criteria_json, due_date)
      VALUES
        (${classId}::uuid, 'Finish the story', ${bookId}::uuid, 'finish_book', '{}'::jsonb, CURRENT_DATE - 3),
        (${classId}::uuid, 'Read 10 pages', ${bookId2}::uuid, 'total_pages', '{"pages": 10}'::jsonb, CURRENT_DATE + 2),
        (${classId}::uuid, 'Read 8 pages', ${bookId}::uuid, 'total_pages', '{"pages": 8}'::jsonb, CURRENT_DATE - 1)
    `;

    // Vary progress: first kid finishes book1, others partial
    if (kids[0]) {
      await db`
        UPDATE progress
        SET max_location = GREATEST(COALESCE(total_locations, 20) - 1, 15),
            updated_at = now()
        WHERE child_id = ${kids[0].id}::uuid AND book_id = ${bookId}::uuid
      `;
    }
    // Add extra pages for first kid to help unlock a reward
    if (kids[0] && bookId) {
      await db`
        INSERT INTO page_log (child_id, book_id, day, pages)
        VALUES (${kids[0].id}::uuid, ${bookId}::uuid, CURRENT_DATE, 12)
      `;
    }
  }

  await db`
    UPDATE households
    SET pot_available_cents = 4000
    WHERE id = ${hid}::uuid
  `;

  // Recheck to unlock any met rewards
  await recheckHousehold(hid);

  revalidatePath("/parent");
  revalidatePath("/kid");
  revalidatePath("/teacher");
}
