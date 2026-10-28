"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { ensureHousehold } from "@/lib/ensure-household";

async function teacherOfUser() {
  const { userId } = await auth();
  if (!userId) throw new Error("Not signed in");
  const user = await currentUser();
  const email =
    user?.primaryEmailAddress?.emailAddress ?? `${userId}@users.invalid`;
  return ensureHousehold({ clerkUserId: userId, email });
}

export async function createClass(formData: FormData) {
  const teacher = await teacherOfUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Class name is required");
  const db = sql();
  await db`UPDATE users SET is_teacher = true WHERE id = ${teacher.user_id}::uuid`;
  await db`
    INSERT INTO classes (teacher_user_id, name)
    VALUES (${teacher.user_id}::uuid, ${name})
  `;
  revalidatePath("/teacher");
}

export async function enrollKid(formData: FormData) {
  const teacher = await teacherOfUser();
  const classId = String(formData.get("class_id") ?? "");
  const childId = String(formData.get("child_id") ?? "");
  if (!classId || !childId) throw new Error("Class and kid are required");
  const db = sql();
  const owned = await db`
    SELECT id FROM classes
    WHERE id = ${classId}::uuid AND teacher_user_id = ${teacher.user_id}::uuid
    LIMIT 1
  `;
  if (!owned[0]) throw new Error("Class not found");
  const kid = await db`
    SELECT id FROM children
    WHERE id = ${childId}::uuid AND household_id = ${teacher.household_id}::uuid
    LIMIT 1
  `;
  if (!kid[0]) throw new Error("Kid not in this household");
  await db`
    INSERT INTO enrollments (class_id, child_id)
    VALUES (${classId}::uuid, ${childId}::uuid)
    ON CONFLICT DO NOTHING
  `;
  revalidatePath("/teacher");
  revalidatePath("/parent");
  revalidatePath("/kid");
}

export async function removeEnrollment(formData: FormData) {
  const teacher = await teacherOfUser();
  const classId = String(formData.get("class_id") ?? "");
  const childId = String(formData.get("child_id") ?? "");
  if (!classId || !childId) throw new Error("Class and kid are required");
  const db = sql();
  await db`
    DELETE FROM enrollments e
    USING classes cl
    WHERE e.class_id = ${classId}::uuid
      AND e.child_id = ${childId}::uuid
      AND e.class_id = cl.id
      AND cl.teacher_user_id = ${teacher.user_id}::uuid
  `;
  revalidatePath("/teacher");
  revalidatePath("/parent");
  revalidatePath("/kid");
}

export async function createAssignment(formData: FormData) {
  const teacher = await teacherOfUser();
  const classId = String(formData.get("class_id") ?? "");
  const bookId = String(formData.get("book_id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const goal = String(formData.get("goal") ?? "finish");
  const pages = Number(formData.get("pages") ?? 0);
  if (!classId || !bookId || !title) throw new Error("Class, book, and title are required");
  if (goal === "pages" && (!pages || pages < 1)) throw new Error("Enter a page count");
  const db = sql();
  const owned = await db`
    SELECT id FROM classes
    WHERE id = ${classId}::uuid AND teacher_user_id = ${teacher.user_id}::uuid
    LIMIT 1
  `;
  if (!owned[0]) throw new Error("Class not found");
  const type = goal === "pages" ? "total_pages" : "finish_book";
  const criteria = goal === "pages" ? JSON.stringify({ pages }) : "{}";
  await db`
    INSERT INTO assignments (class_id, title, book_id, criteria_type, criteria_json)
    VALUES (
      ${classId}::uuid,
      ${title},
      ${bookId}::uuid,
      ${type},
      ${criteria}::jsonb
    )
  `;
  revalidatePath("/teacher");
  revalidatePath("/kid");
}

export async function removeAssignment(formData: FormData) {
  const teacher = await teacherOfUser();
  const assignmentId = String(formData.get("assignment_id") ?? "");
  if (!assignmentId) throw new Error("Missing assignment");
  const db = sql();
  await db`
    DELETE FROM assignments a
    USING classes cl
    WHERE a.id = ${assignmentId}::uuid
      AND a.class_id = cl.id
      AND cl.teacher_user_id = ${teacher.user_id}::uuid
  `;
  revalidatePath("/teacher");
  revalidatePath("/kid");
}
