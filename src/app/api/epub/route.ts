import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { sql } from "@/lib/db";
import { readKidSession } from "@/lib/kid-auth";

const EPUB_URL =
  /^https:\/\/www\.gutenberg\.org\/cache\/epub\/\d+\/pg\d+\.epub$/;

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url") ?? "";
  if (!EPUB_URL.test(url)) {
    return NextResponse.json({ error: "Invalid or disallowed URL" }, { status: 400 });
  }

  const { userId } = await auth();
  const kidId = await readKidSession();
  if (!userId && !kidId) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  try {
    const db = sql();
    const encoded = encodeURIComponent(url);
    const known = await db`
      SELECT 1 FROM books
      WHERE epub_path LIKE ${"%" + encoded + "%"}
         OR epub_path LIKE ${"%" + url + "%"}
      LIMIT 1
    `;
    if (!known[0]) {
      return NextResponse.json({ error: "Book not in the library" }, { status: 403 });
    }

    const res = await fetch(url);
    if (!res.ok) {
      return NextResponse.json({ error: "Failed to fetch EPUB" }, { status: 502 });
    }
    const buffer = await res.arrayBuffer();
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/epub+zip",
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch (err) {
    console.error("EPUB proxy error:", err);
    return NextResponse.json({ error: "Proxy error" }, { status: 500 });
  }
}
