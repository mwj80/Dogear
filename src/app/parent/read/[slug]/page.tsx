import Link from "next/link";
import { auth, currentUser } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { ensureHousehold } from "@/lib/ensure-household";
import { ensureSchema } from "@/lib/ensure-schema";
import Reader from "../../../kid/[childId]/book/[slug]/reader";

export default async function ParentBookPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const { slug } = await params;

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? `${userId}@users.invalid`;
  const household = await ensureHousehold({ clerkUserId: userId, email });
  const db = sql();
  await ensureSchema();

  const books = await db`
    SELECT id, title, author, epub_path, cover_url, teaser
    FROM books
    WHERE slug = ${slug} AND COALESCE(drm_required, false) = false
    LIMIT 1
  `;
  if (!books[0]) notFound();
  const book = books[0] as { id: string; title: string; author: string; epub_path: string; cover_url: string | null; teaser: string | null };

  const progress = await db`
    SELECT max_location FROM parent_progress
    WHERE household_id = ${household.household_id}::uuid AND book_id = ${book.id}::uuid
    LIMIT 1
  `;
  const startLocation = Number((progress[0] as { max_location: number } | undefined)?.max_location ?? 0);

  return (
    <main>
      <header className="top">
        <Link href="/parent/read">Back to books</Link>
      </header>
      <h1>{book.title}</h1>
      <p className="muted">{book.author}</p>
      <Reader
        childId=""
        bookId={book.id}
        title={book.title}
        author={book.author}
        epubPath={book.epub_path}
        startLocation={startLocation}
        readThis={0}
        readAcross={0}
        rewards={[]}
        assignments={[]}
        today=""
        coverUrl={book.cover_url}
        teaser={book.teaser}
      />
    </main>
  );
}
