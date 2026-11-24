"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { ensureUser } from "@/lib/ensure-user";
import { ensureHousehold } from "@/lib/ensure-household";

export async function setRole(formData: FormData) {
  const { userId } = await auth();
  if (!userId) throw new Error("Not signed in");
  const user = await currentUser();
  const email =
    user?.primaryEmailAddress?.emailAddress ?? `${userId}@users.invalid`;

  const role = String(formData.get("role") ?? "");
  const wantParent = role === "parent" || role === "both";
  const wantTeacher = role === "teacher" || role === "both";

  const u = await ensureUser({ clerkUserId: userId, email });
  const db = sql();

  await db`
    UPDATE users
    SET is_parent = ${wantParent}, is_teacher = ${wantTeacher}
    WHERE id = ${u.id}::uuid
  `;

  if (wantParent) {
    await ensureHousehold({ clerkUserId: userId, email });
  }

  if (wantTeacher && !wantParent) {
    redirect("/teacher");
  }
  if (wantParent && !wantTeacher) {
    redirect("/parent");
  }
  // Both: land on parent, with teacher link available
  redirect("/parent");
}
