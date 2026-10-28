"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";

export async function updateRates(formData: FormData) {
  const { userId } = await auth();
  if (!userId) throw new Error("Not signed in");

  const robux = Number(formData.get("robux_dollars_per_100"));
  const gift = Number(formData.get("gift_multiplier"));
  const pizza = Number(formData.get("pizza_fixed_dollars"));
  const custom = Number(formData.get("custom_default_dollars"));
  if (![robux, gift, pizza, custom].every((n) => Number.isFinite(n) && n > 0)) {
    throw new Error("Each rate must be greater than 0");
  }

  const db = sql();
  const existing = await db`SELECT id FROM admin_rates LIMIT 1`;
  if (existing[0]) {
    const id = (existing[0] as { id: string }).id;
    await db`
      UPDATE admin_rates
      SET robux_dollars_per_100 = ${robux},
          gift_multiplier = ${gift},
          pizza_fixed_dollars = ${pizza},
          custom_default_dollars = ${custom},
          updated_at = now()
      WHERE id = ${id}::uuid
    `;
  } else {
    await db`
      INSERT INTO admin_rates (
        robux_dollars_per_100, gift_multiplier, pizza_fixed_dollars, custom_default_dollars
      )
      VALUES (${robux}, ${gift}, ${pizza}, ${custom})
    `;
  }

  revalidatePath("/admin");
  revalidatePath("/parent");
}
