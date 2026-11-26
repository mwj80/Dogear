import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { sql } from "@/lib/db";
import { ensureSchema } from "@/lib/ensure-schema";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !secret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 400 });
  }

  let event;
  try {
    event = stripe().webhooks.constructEvent(body, sig, secret);
  } catch (err) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as {
      id: string;
      payment_status: string;
      metadata?: { household_id?: string; cents?: string };
    };
    if (session.payment_status !== "paid") {
      return NextResponse.json({ received: true });
    }
    const cents = Number(session.metadata?.cents ?? 0);
    const householdId = session.metadata?.household_id;
    if (!cents || !householdId) {
      return NextResponse.json({ received: true });
    }

    const db = sql();
    await ensureSchema();

    const existing = await db`
      SELECT 1 FROM ledger
      WHERE household_id = ${householdId}::uuid
        AND note = ${`Stripe ${session.id}`}
      LIMIT 1
    `;
    if (!existing[0]) {
      await db`
        UPDATE households
        SET pot_available_cents = pot_available_cents + ${cents},
            pot_loaded_cents = pot_loaded_cents + ${cents}
        WHERE id = ${householdId}::uuid
      `;
      await db`
        INSERT INTO ledger (household_id, kind, amount_cents, note)
        VALUES (${householdId}::uuid, 'load', ${cents}, ${`Stripe ${session.id}`})
      `;
    }
  }

  return NextResponse.json({ received: true });
}
