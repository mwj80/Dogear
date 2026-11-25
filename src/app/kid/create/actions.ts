"use server";

import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { ensureSchema } from "@/lib/ensure-schema";
import { hashPin, setKidSession } from "@/lib/kid-auth";

function newClaimCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

export async function createKidAccount(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const pin = String(formData.get("pin") ?? "").trim();
  if (!name || pin.length < 4) {
    redirect("/kid/create?error=missing");
  }
  await ensureSchema();
  const db = sql();

  const existing = await db`
    SELECT id FROM children
    WHERE lower(display_name) = lower(${name}) AND pin_hash IS NOT NULL
    LIMIT 1
  `;
  if (existing[0]) {
    redirect("/kid/create?error=taken");
  }

  const claim = newClaimCode();
  const created = await db`
    INSERT INTO children (display_name, pin_hash, claim_code, household_id)
    VALUES (${name}, ${hashPin(pin)}, ${claim}, NULL)
    RETURNING id::text AS id
  `;
  const childId = (created[0] as { id: string }).id;

  // Seed free public-domain books so they have something to read
  const free = await db`SELECT id FROM books WHERE price_cents = 0 AND COALESCE(drm_required, false) = false LIMIT 6`;
  for (const b of free as { id: string }[]) {
    await db`
      INSERT INTO kid_books (child_id, book_id, purchased_by)
      VALUES (${childId}::uuid, ${b.id}::uuid, 'self')
      ON CONFLICT DO NOTHING
    `;
  }

  await setKidSession(childId);
  redirect(`/kid/${childId}?created=1`);
}

export async function claimKid(formData: FormData) {
  const { auth, currentUser } = await import("@clerk/nextjs/server");
  const { ensureHousehold } = await import("@/lib/ensure-household");
  const { userId } = await auth();
  if (!userId) throw new Error("Not signed in");
  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? `${userId}@users.invalid`;
  const household = await ensureHousehold({ clerkUserId: userId, email });
  const code = String(formData.get("claim_code") ?? "").trim().toUpperCase();
  if (!code) redirect("/parent/kid/new?claim=missing");

  const db = sql();
  const kids = await db`
    SELECT id, display_name FROM children
    WHERE claim_code = ${code} AND household_id IS NULL
    LIMIT 1
  `;
  if (!kids[0]) redirect("/parent/kid/new?claim=bad");
  const kid = kids[0] as { id: string; display_name: string };

  await db`
    UPDATE children
    SET household_id = ${household.household_id}::uuid, claim_code = NULL
    WHERE id = ${kid.id}::uuid
  `;
  redirect(`/parent/kid/new?claim=ok&name=${encodeURIComponent(kid.display_name)}`);
}
