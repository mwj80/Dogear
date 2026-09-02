"use client";

import { useEffect, useRef, useState } from "react";
import { saveProgress } from "./actions";

type Props = {
  childId: string;
  bookId: string;
  epubPath: string;
  startLocation: number;
};

declare global {
  interface Window {
    ePub?: (url: string) => EpubBook;
  }
}

type EpubBook = {
  ready: Promise<unknown>;
  locations: {
    generate: (chars: number) => Promise<unknown>;
    length: () => number;
    cfiFromLocation: (n: number) => string;
    locationFromCfi: (cfi: string) => number;
  };
  renderTo: (
    el: HTMLElement,
    opts: Record<string, unknown>
  ) => EpubRendition;
};

type EpubRendition = {
  display: (target?: string) => Promise<unknown>;
  next: () => Promise<unknown>;
  prev: () => Promise<unknown>;
  currentLocation: () => { start?: { cfi?: string } };
  themes: { default: (obj: Record<string, Record<string, string>>) => void };
  resize: (w: number, h: number) => void;
};

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(s);
  });
}

export default function Reader({
  childId,
  bookId,
  epubPath,
  startLocation
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<EpubRendition | null>(null);
  const bookRef = useRef<EpubBook | null>(null);
  const [page, setPage] = useState(startLocation + 1);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState("Loading book…");
  const maxRef = useRef(startLocation);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        await loadScript(
          "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"
        );
        await loadScript(
          "https://cdn.jsdelivr.net/npm/epubjs@0.3.93/dist/epub.min.js"
        );
        if (cancelled || !hostRef.current || !window.ePub) return;

        const book = window.ePub(epubPath);
        bookRef.current = book;
        await book.ready;
        if (cancelled) return;

        const w = hostRef.current.clientWidth || 720;
        const h = Math.max(420, Math.floor(window.innerHeight * 0.6));
        hostRef.current.style.height = `${h}px`;

        const rendition = book.renderTo(hostRef.current, {
          width: w,
          height: h,
          flow: "paginated",
          spread: "none",
          allowScriptedContent: false
        });
        renditionRef.current = rendition;
        rendition.themes.default({
          body: {
            "font-family": "Georgia, serif",
            "line-height": "1.5",
            color: "#1c1916"
          }
        });

        await book.locations.generate(700);
        if (cancelled) return;
        const length = book.locations.length() || 1;
        setTotal(length);

        const start = Math.min(Math.max(startLocation, 0), length - 1);
        const cfi = book.locations.cfiFromLocation(start);
        await rendition.display(cfi);
        setPage(start + 1);
        setStatus("");

        await saveProgress({
          childId,
          bookId,
          maxLocation: Math.max(start, maxRef.current),
          totalLocations: length
        });
      } catch (err) {
        setStatus(err instanceof Error ? err.message : "Could not open book");
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, [bookId, childId, epubPath, startLocation]);

  async function updateFromRendition(direction: "next" | "prev") {
    const rendition = renditionRef.current;
    const book = bookRef.current;
    if (!rendition || !book) return;
    if (direction === "next") await rendition.next();
    else await rendition.prev();
    const loc = rendition.currentLocation();
    const cfi = loc?.start?.cfi;
    if (!cfi) return;
    const idx = book.locations.locationFromCfi(cfi);
    const safe = Number.isFinite(idx) ? Math.max(0, idx) : 0;
    setPage(safe + 1);
    if (safe > maxRef.current) {
      maxRef.current = safe;
      const length = book.locations.length() || total;
      void saveProgress({
        childId,
        bookId,
        maxLocation: safe,
        totalLocations: length
      });
    }
  }

  const pct = total ? Math.round(((maxRef.current + 1) / total) * 100) : 0;

  return (
    <div>
      <p>
        Page {page}
        {total ? ` of ${total}` : ""} · Highest reached {pct}%
      </p>
      {status ? <p>{status}</p> : null}
      <div ref={hostRef} className="reader" />
      <div className="nav">
        <button type="button" className="btn" onClick={() => void updateFromRendition("prev")}>
          Previous
        </button>
        <button type="button" className="btn" onClick={() => void updateFromRendition("next")}>
          Next
        </button>
      </div>
    </div>
  );
}
