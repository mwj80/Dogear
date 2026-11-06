export type CatalogHit = {
  gutenbergId: number;
  title: string;
  author: string;
  subjects: string[];
  epubUrl: string;
};

/** Search Project Gutenberg via Gutendex. Returns English books that have an EPUB. */
export async function searchGutendex(opts: {
  q: string;
  allowAdult: boolean;
}): Promise<CatalogHit[]> {
  const q = opts.q.trim();
  if (!q) return [];

  const params = new URLSearchParams({
    search: q,
    languages: "en",
    mime_type: "application/epub+zip"
  });
  if (!opts.allowAdult) params.set("topic", "children");

  const res = await fetch(`https://gutendex.com/books?${params}`, {
    next: { revalidate: 300 }
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    results?: {
      id: number;
      title: string;
      authors?: { name: string }[];
      subjects?: string[];
      bookshelves?: string[];
      formats?: Record<string, string>;
    }[];
  };

  return (data.results ?? [])
    .map((book) => {
      const epubUrl =
        book.formats?.["application/epub+zip"] ??
        Object.entries(book.formats ?? {}).find(([mime]) =>
          mime.startsWith("application/epub+zip")
        )?.[1];
      if (!epubUrl || !epubUrl.startsWith("https://www.gutenberg.org/")) return null;
      return {
        gutenbergId: book.id,
        title: book.title,
        author: book.authors?.[0]?.name ?? "",
        subjects: [...(book.subjects ?? []), ...(book.bookshelves ?? [])].slice(0, 3),
        epubUrl
      } satisfies CatalogHit;
    })
    .filter((book): book is CatalogHit => book !== null);
}
