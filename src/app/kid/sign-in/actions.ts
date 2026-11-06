"use server";

import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { ensureSchema } from "@/lib/ensure-schema";
import { pinsMatch, setKidSession, clearKidSession } from "@/lib/kid-auth";

export async function signInKid(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const pin = String(formData.get("pin") ?? "").trim();
  const next = String(formData.get("next") ?? "");
  if (!name || !pin) redirect("/kid/sign-in?error=missing");

  const db = sql();
  await ensureSchema();
  const rows = await db`
    SELECT id::text AS id, pin_hash
    FROM children
    WHERE lower(display_name) = lower(${name})
      AND pin_hash IS NOT NULL
  `;
  const matches = (rows as { id: string; pin_hash: string }[]).filter((row) =>
    pinsMatch(pin, row.pin_hash)
  );
  if (matches.length !== 1) redirect("/kid/sign-in?error=no");

  const childId = matches[0].id;
  await setKidSession(childId);
  const dest =
    next.startsWith(`/kid/${childId}`) ? next : `/kid/${childId}`;
  redirect(dest);
}

export async function signOutKid() {
  await clearKidSession();
  redirect("/kid/sign-in");
}
