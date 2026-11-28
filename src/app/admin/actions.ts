"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";

export async function updateRates(formData: FormData) {
  const { userId } = await auth();
  if (!userId) throw new Error("Not signed in");

  const gift = Number(formData.get("gift_multiplier"));
  if (!Number.isFinite(gift) || gift < 1) {
    throw new Error("Markup must be at least 1.00");
  }

  const db = sql();
  const existing = await db`SELECT id FROM admin_rates LIMIT 1`;
  if (existing[0]) {
    const id = (existing[0] as { id: string }).id;
    await db`
      UPDATE admin_rates
      SET gift_multiplier = ${gift},
          updated_at = now()
      WHERE id = ${id}::uuid
    `;
  } else {
    await db`
      INSERT INTO admin_rates (gift_multiplier)
      VALUES (${gift})
    `;
  }

  revalidatePath("/admin");
  revalidatePath("/parent");
}
