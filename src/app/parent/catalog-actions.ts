"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { ensureHousehold } from "@/lib/ensure-household";
import { ensureSchema } from "@/lib/ensure-schema";

export async function addCatalogBook(formData: FormData) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? `${userId}@users.invalid`;
  await ensureHousehold({ clerkUserId: userId, email });
  const db = sql();
  await ensureSchema();

  const title = String(formData.get("title") ?? "").trim();
  const author = String(formData.get("author") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const epubPath = String(formData.get("epub_path") ?? "").trim();
  const genre = String(formData.get("genre") ?? "").trim() || null;
  const publisher = String(formData.get("publisher") ?? "").trim() || null;
  const source = String(formData.get("source") ?? "manual").trim() || "manual";
  const teaser = String(formData.get("teaser") ?? "").trim() || null;
  const coverUrl = String(formData.get("cover_url") ?? "").trim() || null;
  const priceCents = Math.max(0, Number(formData.get("price_cents") ?? 0) || 0);
  const ageMin = formData.get("age_min") ? Number(formData.get("age_min")) : null;
  const ageMax = formData.get("age_max") ? Number(formData.get("age_max")) : null;
  const drmRequired = formData.get("drm_required") === "on";
  const series = String(formData.get("series") ?? "").trim() || null;
  const seriesNumber = formData.get("series_number") ? Number(formData.get("series_number")) : null;

  if (!title || !author || !slug || !epubPath) {
    redirect("/parent/shop?error=" + encodeURIComponent("Title, author, slug, and epub path are required."));
  }

  await db`
    INSERT INTO books (
      title, author, slug, epub_path, price_cents, genre, publisher, source,
      teaser, cover_url, age_min, age_max, drm_required, series, series_number
    )
    VALUES (
      ${title}, ${author}, ${slug}, ${epubPath}, ${priceCents}, ${genre}, ${publisher}, ${source},
      ${teaser}, ${coverUrl}, ${ageMin}, ${ageMax}, ${drmRequired}, ${series}, ${seriesNumber}
    )
    ON CONFLICT (slug) DO UPDATE SET
      title = EXCLUDED.title,
      author = EXCLUDED.author,
      epub_path = EXCLUDED.epub_path,
      price_cents = EXCLUDED.price_cents,
      genre = EXCLUDED.genre,
      publisher = EXCLUDED.publisher,
      source = EXCLUDED.source,
      teaser = EXCLUDED.teaser,
      cover_url = EXCLUDED.cover_url,
      age_min = EXCLUDED.age_min,
      age_max = EXCLUDED.age_max,
      drm_required = EXCLUDED.drm_required,
      series = EXCLUDED.series,
      series_number = EXCLUDED.series_number
  `;

  revalidatePath("/parent/shop");
  redirect("/parent/shop?added=1");
}
