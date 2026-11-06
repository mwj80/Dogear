import { createHash, createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { sql } from "./db";

const COOKIE = "kid_session";
const MAX_AGE = 60 * 60 * 24 * 30;

function secret() {
  return process.env.KID_AUTH_SECRET || "litloot-kid-pin-demo";
}

export function hashPin(pin: string) {
  return createHash("sha256").update(`${secret()}:${pin}`).digest("hex");
}

export function pinsMatch(pin: string, hash: string) {
  const next = hashPin(pin);
  const a = Buffer.from(next);
  const b = Buffer.from(hash);
  return a.length === b.length && timingSafeEqual(a, b);
}

function sign(childId: string) {
  return createHmac("sha256", secret()).update(childId).digest("hex");
}

export async function setKidSession(childId: string) {
  const store = await cookies();
  store.set(COOKIE, `${childId}.${sign(childId)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE
  });
}

export async function clearKidSession() {
  const store = await cookies();
  store.set(COOKIE, "", { path: "/", maxAge: 0 });
}

export async function readKidSession() {
  const store = await cookies();
  const raw = store.get(COOKIE)?.value ?? "";
  const [childId, mac] = raw.split(".");
  if (!childId || !mac) return null;
  const expected = sign(childId);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return childId;
}

/** Parent (Clerk) who owns the kid, or a matching kid session. */
export async function assertKidAccess(childId: string) {
  const sessionId = await readKidSession();
  if (sessionId === childId) return;

  const { userId } = await auth();
  if (userId) {
    const db = sql();
    const rows = await db`
      SELECT 1
      FROM children c
      JOIN households h ON h.id = c.household_id
      JOIN users u ON u.id = h.parent_user_id
      WHERE c.id = ${childId}::uuid AND u.clerk_user_id = ${userId}
      LIMIT 1
    `;
    if (rows[0]) return;
  }

  redirect(`/kid/sign-in?next=${encodeURIComponent(`/kid/${childId}`)}`);
}
