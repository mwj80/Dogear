"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { stripe, hasStripe } from "@/lib/stripe";
import { ensureHousehold } from "@/lib/ensure-household";

export async function createCheckoutSession(formData: FormData) {
  if (!hasStripe()) {
    redirect("/parent/funds?error=stripe");
  }
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const dollars = Number(formData.get("dollars"));
  if (!dollars || dollars < 1) {
    redirect("/parent/funds?error=amount");
  }
  const cents = Math.round(dollars * 100);

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? `${userId}@users.invalid`;
  const household = await ensureHousehold({ clerkUserId: userId, email });

  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    customer_email: email,
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: cents,
          product_data: { name: "LitLoot balance" }
        },
        quantity: 1
      }
    ],
    metadata: {
      household_id: household.household_id,
      cents: String(cents)
    },
    success_url: `${process.env.NEXT_PUBLIC_APP_URL || "https://dogear-iota.vercel.app"}/parent/funds/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || "https://dogear-iota.vercel.app"}/parent/funds?canceled=1`
  });

  if (!session.url) redirect("/parent/funds?error=stripe");
  redirect(session.url);
}
