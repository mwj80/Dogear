"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { ensureHousehold } from "@/lib/ensure-household";
import { ensureSchema } from "@/lib/ensure-schema";
import { gutenbergEpubPath } from "@/lib/gutenberg-classics";

export async function addOrBuyBook(formData: FormData) {
  const { userId } = await auth();
  if (!userId) throw new Error("Not signed in");

  const childId = String(formData.get("child_id") ?? "");
  const bookId = String(formData.get("book_id") ?? "");
  const by = String(formData.get("by") ?? "parent") === "self" ? "self" : "parent";
  if (!childId || !bookId) throw new Error("Kid and book are required");

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? `${userId}@users.invalid`;
  const household = await ensureHousehold({ clerkUserId: userId, email });
  const db = sql();
  await ensureSchema();

  const kidRows = await db`
    SELECT id, can_self_purchase, household_id
    FROM children
    WHERE id = ${childId}::uuid AND household_id = ${household.household_id}::uuid
    LIMIT 1
  `;
  const kid = kidRows[0] as { id: string; can_self_purchase: boolean; household_id: string } | undefined;
  if (!kid) throw new Error("Kid not found");
  if (by === "self" && !kid.can_self_purchase) throw new Error("This kid is not authorized to buy books");

  const bookRows = await db`
    SELECT id, title, price_cents FROM books WHERE id = ${bookId}::uuid LIMIT 1
  `;
  const book = bookRows[0] as { id: string; title: string; price_cents: number } | undefined;
  if (!book) throw new Error("Book not found");

  const owned = await db`
    SELECT 1 FROM kid_books WHERE child_id = ${childId}::uuid AND book_id = ${bookId}::uuid LIMIT 1
  `;
  if (owned[0]) throw new Error("Already on this kid’s reader");

  const price = Number(book.price_cents || 0);
  const note = `Purchase: ${book.title}`;

  if (price > 0) {
    const house = await db`
      SELECT pot_available_cents FROM households WHERE id = ${household.household_id}::uuid
    `;
    const available = Number((house[0] as { pot_available_cents: number } | undefined)?.pot_available_cents ?? 0);
    if (available < price) throw new Error(`Insufficient balance (need $${(price / 100).toFixed(2)})`);

    await db.transaction([
      db`
        UPDATE households
        SET pot_available_cents = pot_available_cents - ${price}
        WHERE id = ${household.household_id}::uuid
      `,
      db`
        INSERT INTO ledger (household_id, kind, amount_cents, note)
        VALUES (${household.household_id}::uuid, 'spend', ${price}, ${note})
      `,
      db`
        INSERT INTO kid_books (child_id, book_id, purchased_by)
        VALUES (${childId}::uuid, ${bookId}::uuid, ${by})
      `,
      db`
        INSERT INTO progress (child_id, book_id, max_location, total_locations)
        VALUES (${childId}::uuid, ${bookId}::uuid, 0, 0)
        ON CONFLICT (child_id, book_id) DO NOTHING
      `
    ]);
  } else {
    await db.transaction([
      db`
        INSERT INTO kid_books (child_id, book_id, purchased_by)
        VALUES (${childId}::uuid, ${bookId}::uuid, ${by})
      `,
      db`
        INSERT INTO progress (child_id, book_id, max_location, total_locations)
        VALUES (${childId}::uuid, ${bookId}::uuid, 0, 0)
        ON CONFLICT (child_id, book_id) DO NOTHING
      `
    ]);
  }

  revalidatePath("/parent");
  revalidatePath("/parent/shop");
  revalidatePath("/kid");
  revalidatePath(`/kid/${childId}/shop`);
}

export async function addCatalogBook(formData: FormData) {
  const { userId } = await auth();
  if (!userId) throw new Error("Not signed in");

  const childId = String(formData.get("child_id") ?? "");
  const gutenbergId = Number(formData.get("gutenberg_id") ?? 0);
  const title = String(formData.get("title") ?? "").trim();
  const author = String(formData.get("author") ?? "").trim();
  const genre = String(formData.get("genre") ?? "").trim();
  const by = String(formData.get("by") ?? "parent") === "self" ? "self" : "parent";
  if (!childId || !gutenbergId || !title) throw new Error("Kid and book are required");

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? `${userId}@users.invalid`;
  const household = await ensureHousehold({ clerkUserId: userId, email });
  const db = sql();
  await ensureSchema();

  const kidRows = await db`
    SELECT id, can_self_purchase, COALESCE(can_browse_adult, false) AS can_browse_adult
    FROM children
    WHERE id = ${childId}::uuid AND household_id = ${household.household_id}::uuid
    LIMIT 1
  `;
  const kid = kidRows[0] as { id: string; can_self_purchase: boolean; can_browse_adult: boolean } | undefined;
  if (!kid) throw new Error("Kid not found");
  if (by === "self" && !kid.can_self_purchase) throw new Error("This kid is not authorized to buy books");
  if (by === "self" && !kid.can_browse_adult) throw new Error("This kid is not allowed to search the full catalog");

  const slug = `gutenberg-${gutenbergId}`;
  const path = gutenbergEpubPath(gutenbergId);
  const inserted = await db`
    INSERT INTO books (title, author, slug, price_cents, epub_path, genre)
    VALUES (${title}, ${author}, ${slug}, 0, ${path}, ${genre || null})
    ON CONFLICT (slug) DO UPDATE SET
      title = EXCLUDED.title,
      author = EXCLUDED.author,
      epub_path = EXCLUDED.epub_path
    RETURNING id
  `;
  const bookId = (inserted[0] as { id: string }).id;

  await db.transaction([
    db`
      INSERT INTO kid_books (child_id, book_id, purchased_by)
      VALUES (${childId}::uuid, ${bookId}::uuid, ${by})
      ON CONFLICT DO NOTHING
    `,
    db`
      INSERT INTO progress (child_id, book_id, max_location, total_locations)
      VALUES (${childId}::uuid, ${bookId}::uuid, 0, 0)
      ON CONFLICT (child_id, book_id) DO NOTHING
    `
  ]);

  revalidatePath("/parent");
  revalidatePath("/parent/shop");
  revalidatePath("/kid");
  revalidatePath(`/kid/${childId}/shop`);
}

export async function toggleFullCatalog(formData: FormData) {
  const { userId } = await auth();
  if (!userId) throw new Error("Not signed in");

  const childId = String(formData.get("child_id") ?? "");
  const can = formData.get("can_browse_adult") === "on";
  if (!childId) throw new Error("Kid is required");

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? `${userId}@users.invalid`;
  const household = await ensureHousehold({ clerkUserId: userId, email });
  const db = sql();
  await ensureSchema();

  const kidNameRows = await db`
    SELECT display_name FROM children
    WHERE id = ${childId}::uuid AND household_id = ${household.household_id}::uuid
    LIMIT 1
  `;
  const kidName = String((kidNameRows[0] as { display_name: string } | undefined)?.display_name ?? "kid");

  await db`
    UPDATE children
    SET can_browse_adult = ${can}
    WHERE id = ${childId}::uuid AND household_id = ${household.household_id}::uuid
  `;

  revalidatePath("/parent");
  revalidatePath("/parent/kid/new");
  revalidatePath(`/kid/${childId}/shop`);
  redirect(`/parent/kid/new?catalog=${can ? "on" : "off"}&name=${encodeURIComponent(kidName)}`);
}

export async function toggleSelfPurchase(formData: FormData) {
  const { userId } = await auth();
  if (!userId) throw new Error("Not signed in");

  const childId = String(formData.get("child_id") ?? "");
  const can = formData.get("can_self_purchase") === "on";
  if (!childId) throw new Error("Kid is required");

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? `${userId}@users.invalid`;
  const household = await ensureHousehold({ clerkUserId: userId, email });
  const db = sql();
  await ensureSchema();

  const kidNameRows = await db`
    SELECT display_name FROM children
    WHERE id = ${childId}::uuid AND household_id = ${household.household_id}::uuid
    LIMIT 1
  `;
  const kidName = String((kidNameRows[0] as { display_name: string } | undefined)?.display_name ?? "kid");

  await db`
    UPDATE children
    SET can_self_purchase = ${can}
    WHERE id = ${childId}::uuid AND household_id = ${household.household_id}::uuid
  `;

  revalidatePath("/parent");
  revalidatePath("/parent/kid/new");
  redirect(`/parent/kid/new?permission=${can ? "allowed" : "removed"}&name=${encodeURIComponent(kidName)}`);
}
