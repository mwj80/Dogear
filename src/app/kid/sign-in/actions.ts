"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { ensureSchema } from "@/lib/ensure-schema";
import { pinsMatch, setKidSession, clearKidSession } from "@/lib/kid-auth";

const WINDOW_MINUTES = 15;
const MAX_ATTEMPTS = 5;

async function clientKey(name: string) {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "unknown";
  const ip = forwarded.split(",")[0].trim();
  return `${ip}:${name.toLowerCase()}`;
}

export async function signInKid(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const pin = String(formData.get("pin") ?? "").trim();
  const next = String(formData.get("next") ?? "");
  if (!name || !pin) redirect("/kid/sign-in?error=missing");

  const db = sql();
  await ensureSchema();
  const key = await clientKey(name);

  const recent = await db`
    SELECT count(*)::int AS n
    FROM kid_sign_in_attempts
    WHERE key = ${key}
      AND created_at > now() - make_interval(mins => ${WINDOW_MINUTES})
  `;
  const failures = Number((recent[0] as { n: number } | undefined)?.n ?? 0);
  if (failures >= MAX_ATTEMPTS) {
    redirect("/kid/sign-in?error=locked");
  }

  const rows = await db`
    SELECT id::text AS id, pin_hash
    FROM children
    WHERE lower(display_name) = lower(${name})
      AND pin_hash IS NOT NULL
  `;
  const matches = (rows as { id: string; pin_hash: string }[]).filter((row) =>
    pinsMatch(pin, row.pin_hash)
  );
  if (matches.length !== 1) {
    await db`INSERT INTO kid_sign_in_attempts (key) VALUES (${key})`;
    redirect("/kid/sign-in?error=no");
  }

  await db`DELETE FROM kid_sign_in_attempts WHERE key = ${key}`;
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
