"use client";

import { useEffect, useRef, useState } from "react";
import { saveProgress } from "./actions";

type RewardInfo = {
  id: string;
  face_value: string;
  status: string;
  criteria_type?: string;
  scope?: string;
  mode?: string | null;
  pages?: number | null;
  days?: number | null;
  streak?: number;
  todayPages?: number;
};

type Props = {
  childId: string;
  bookId: string;
  epubPath: string;
  startLocation: number;
  readThis: number;
  readAcross: number;
  rewards: RewardInfo[];
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

function isRead(reward: RewardInfo) {
  return reward.scope === "any" || reward.mode === "read";
}

function goalLabel(reward: RewardInfo) {
  if (reward.criteria_type === "daily_streak") {
    const where = reward.scope === "any" ? " in any book" : "";
    return `Read ${reward.pages} pages a day for ${reward.days} days${where}`;
  }
  if (reward.scope === "any") {
    return `Read ${reward.pages ?? 0} pages in any book`;
  }
  if (reward.criteria_type === "finish_book") return "Finish this book";
  if (reward.mode === "read") return `Read ${reward.pages} pages`;
  return `Reach page ${reward.pages}`;
}

function targetOf(reward: RewardInfo, bookTotal: number) {
  if (reward.criteria_type === "daily_streak") return reward.days || 0;
  if (reward.criteria_type === "total_pages" && reward.pages) return reward.pages;
  return bookTotal || 0;
}

function streakNow(reward: RewardInfo, readDelta: number) {
  const perDay = reward.pages || 0;
  const already = (reward.todayPages ?? 0) >= perDay;
  const todayNow = (reward.todayPages ?? 0) + readDelta;
  const base = reward.streak ?? 0;
  if (already || perDay < 1) return base;
  return todayNow >= perDay ? base + 1 : base;
}

export default function Reader({
  childId,
  bookId,
  epubPath,
  startLocation,
  readThis,
  readAcross,
  rewards
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<EpubRendition | null>(null);
  const bookRef = useRef<EpubBook | null>(null);
  const [page, setPage] = useState(startLocation + 1);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState("Loading book…");
  const [items, setItems] = useState(rewards);
  const [justUnlocked, setJustUnlocked] = useState<string[]>([]);
  const [highest, setHighest] = useState(startLocation);
  const maxRef = useRef(startLocation);

  function applyUnlocks(unlocked: { id: string; face_value: string }[]) {
    if (!unlocked?.length) return;
    setItems((prev) =>
      prev.map((item) =>
        unlocked.some((u) => u.id === item.id)
          ? { ...item, status: "unlocked" }
          : item
      )
    );
    setJustUnlocked(unlocked.map((u) => u.face_value));
  }

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
        setHighest(Math.max(start, maxRef.current));
        setStatus("");

        const unlocked = await saveProgress({
          childId,
          bookId,
          maxLocation: Math.max(start, maxRef.current),
          totalLocations: length
        });
        applyUnlocks(unlocked ?? []);
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
      setHighest(safe);
      const length = book.locations.length() || total;
      void saveProgress({
        childId,
        bookId,
        maxLocation: safe,
        totalLocations: length
      }).then((unlocked) => applyUnlocks(unlocked ?? []));
    }
  }

  const pct = total ? Math.round(((highest + 1) / total) * 100) : 0;
  const readDelta = Math.max(0, highest - startLocation);

  const active = items.filter((r) => r.status === "active");
  const unlocked = items.filter((r) => r.status === "unlocked");

  return (
    <div>
      {active.length > 0 && (
        <div className="banner">
          {active.map((r) => {
            const target = targetOf(r, total);
            const raw =
              r.criteria_type === "daily_streak"
                ? streakNow(r, readDelta)
                : isRead(r)
                  ? (r.scope === "any" ? readAcross : readThis) + readDelta
                  : highest;
            const current = target > 0 ? Math.min(Math.max(raw, 0), target) : 0;
            const fill = target > 0 ? Math.round((current / target) * 100) : 0;
            return (
              <div key={r.id} className="reward-track">
                <p>
                  {goalLabel(r)} → <strong>{r.face_value}</strong>
                </p>
                {target > 0 && (
                  <>
                    <div className="progress-meta">
                      <span>
                        {current} / {target}
                        {r.criteria_type === "daily_streak" ? " days" : ""}
                      </span>
                      <span>{fill}%</span>
                    </div>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${fill}%` }} />
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
      {unlocked.length > 0 && active.length === 0 && (
        <div className="banner done">
          {unlocked.map((r) => (
            <p key={r.id}>Unlocked: {r.face_value}</p>
          ))}
        </div>
      )}
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
      {justUnlocked.length > 0 && (
        <div className="modal" onClick={() => setJustUnlocked([])}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2>Reward unlocked!</h2>
            {justUnlocked.map((value) => (
              <p key={value}>{value}</p>
            ))}
            <button type="button" className="btn" onClick={() => setJustUnlocked([])}>
              Keep reading
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
