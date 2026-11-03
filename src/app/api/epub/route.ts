import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url || !url.startsWith("https://www.gutenberg.org/")) {
    return NextResponse.json({ error: "Invalid or disallowed URL" }, { status: 400 });
  }

  try {
    const res = await fetch(url);
    if (!res.ok) {
      return NextResponse.json({ error: "Failed to fetch EPUB" }, { status: 502 });
    }
    const buffer = await res.arrayBuffer();
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/epub+zip",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (err) {
    console.error("EPUB proxy error:", err);
    return NextResponse.json({ error: "Proxy error" }, { status: 500 });
  }
}
