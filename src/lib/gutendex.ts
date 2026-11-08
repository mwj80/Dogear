import { gutenbergCoverUrl } from "./gutenberg-classics";

export type CatalogHit = {
  gutenbergId: number;
  title: string;
  author: string;
  subjects: string[];
  epubUrl: string;
  coverUrl: string;
  teaser: string;
};

export type CatalogResult = {
  hits: CatalogHit[];
  error?: string;
};

function tagText(entry: string, tag: string) {
  const match = entry.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return match ? match[1].replace(/<[^>]+>/g, "").trim() : "";
}

/** Search Project Gutenberg's OPDS catalog. Gutendex was timing out. */
export async function searchGutendex(opts: {
  q: string;
  allowAdult: boolean;
}): Promise<CatalogResult> {
  const q = opts.q.trim();
  if (!q) return { hits: [] };

  const params = new URLSearchParams({ query: q });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(
      `https://www.gutenberg.org/ebooks/search.opds/?${params}`,
      { signal: controller.signal, next: { revalidate: 300 } }
    );
    if (!res.ok) return { hits: [], error: "Catalog search is unavailable right now." };
    const xml = await res.text();
    const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? [];

    const hits: CatalogHit[] = [];
    for (const entry of entries) {
      const idUrl = tagText(entry, "id");
      const idMatch = idUrl.match(/\/ebooks\/(\d+)\.opds/);
      if (!idMatch) continue;
      const title = tagText(entry, "title");
      if (!title || /\(French\)|\(Finnish\)|\(German\)|\(Spanish\)|\(Italian\)/i.test(title)) {
        continue;
      }
      const gutenbergId = Number(idMatch[1]);
      hits.push({
        gutenbergId,
        title,
        author: tagText(entry, "content"),
        subjects: [],
        epubUrl: `https://www.gutenberg.org/cache/epub/${gutenbergId}/pg${gutenbergId}.epub`,
        coverUrl: gutenbergCoverUrl(gutenbergId),
        teaser: "A public-domain book from Project Gutenberg."
      });
      if (hits.length >= 20) break;
    }

    return { hits };
  } catch {
    return { hits: [], error: "Catalog search is unavailable right now." };
  } finally {
    clearTimeout(timer);
  }
}
