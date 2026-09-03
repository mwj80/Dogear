import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "@/lib/db";

export default async function KidHomePage({
  params
}: {
  params: Promise<{ childId: string }>;
}) {
  const { childId } = await params;
  const db = sql();

  const kids = await db`
    SELECT id, display_name FROM children WHERE id = ${childId}::uuid LIMIT 1
  `;
  if (!kids[0]) notFound();

  const books = await db`
    SELECT slug, title, author FROM books ORDER BY title
  `;
  const rewards = await db`
    SELECT r.face_value, r.status, b.title, b.slug
    FROM rewards r
    JOIN books b ON b.id = r.book_id
    WHERE r.child_id = ${childId}::uuid
    ORDER BY r.created_at DESC
  `;

  const kid = kids[0] as { id: string; display_name: string };

  return (
    <main>
      <header className="top">
        <Link href="/parent">Back to parent</Link>
      </header>
      <h1>Hi, {kid.display_name}</h1>
      <p>Pick a book and earn your rewards.</p>
      <div className="card">
        <h2>Rewards</h2>
        {rewards.length === 0 ? (
          <p>No rewards yet.</p>
        ) : (
          <ul>
            {rewards.map((reward, i) => {
              const r = reward as {
                face_value: string;
                status: string;
                title: string;
                slug: string;
              };
              return (
                <li key={`${r.slug}-${i}`}>
                  Finish {r.title} → {r.face_value} ({r.status})
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="card">
        <h2>Library</h2>
        <ul>
          {books.map((book) => {
            const b = book as { slug: string; title: string; author: string };
            return (
              <li key={b.slug}>
                <Link href={`/kid/${kid.id}/book/${b.slug}`}>
                  {b.title}
                </Link>
                <span> — {b.author}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </main>
  );
}
