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

type AssignmentInfo = {
  id: string;
  class_name: string;
  title: string;
  criteria_type: string;
  pages: number | null;
  due_date: string | null;
};

type Props = {
  childId: string;
  bookId: string;
  title: string;
  author: string;
  epubPath: string;
  startLocation: number;
  readThis: number;
  readAcross: number;
  rewards: RewardInfo[];
  assignments: AssignmentInfo[];
  today: string;
};

declare global {
  interface Window {
    ePub?: (source: string | ArrayBuffer) => EpubBook;
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
  hooks: {
    content: {
      register: (fn: (contents: { document: Document }) => void) => void;
    };
  };
};

const SIZES = [80, 100, 110, 130, 150];

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

function themeFor(size: number, night: boolean) {
  return {
    body: {
      "font-family": "Georgia, serif",
      "font-size": `${size}%`,
      "line-height": "1.55",
      color: night ? "#f5f0e8" : "#1c1916",
      background: night ? "#1c1916" : "#fff"
    }
  };
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

function daysUntil(due: string, today: string) {
  return Math.round(
    (Date.parse(`${due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000
  );
}

function dueLabel(due: string | null, today: string, done: boolean) {
  if (!due) return "";
  const days = daysUntil(due, today);
  if (done) return `due ${due}`;
  if (days < 0) return `due ${due} · overdue`;
  if (days === 0) return "due today";
  if (days === 1) return "due tomorrow · 1 day left";
  return `due ${due} · ${days} days left`;
}

export default function Reader({
  childId,
  bookId,
  title,
  author,
  epubPath,
  startLocation,
  readThis,
  readAcross,
  rewards,
  assignments,
  today
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<EpubRendition | null>(null);
  const bookRef = useRef<EpubBook | null>(null);
  const [page, setPage] = useState(startLocation + 1);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState("Loading book\u2026");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [items, setItems] = useState(rewards);
  const [justUnlocked, setJustUnlocked] = useState<string[]>([]);
  const [highest, setHighest] = useState(startLocation);
  const [size, setSize] = useState(110);
  const [night, setNight] = useState(false);
  const maxRef = useRef(startLocation);
  const prefs = useRef({ size: 110, night: false });

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
    const savedSize = Number(localStorage.getItem("litloot-font") ?? 110);
    const savedNight = localStorage.getItem("litloot-night") === "1";
    if (SIZES.includes(savedSize)) {
      prefs.current.size = savedSize;
      setSize(savedSize);
    }
    prefs.current.night = savedNight;
    setNight(savedNight);
  }, []);

  useEffect(() => {
    prefs.current = { size, night };
    renditionRef.current?.themes.default(themeFor(size, night));
    localStorage.setItem("litloot-font", String(size));
    localStorage.setItem("litloot-night", night ? "1" : "0");
    document.body.classList.toggle("night", night);
    return () => {
      document.body.classList.remove("night");
    };
  }, [size, night]);

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

        const res = await fetch(epubPath);
        if (!res.ok) throw new Error(`Could not download the book (${res.status})`);
        let buffer = await res.arrayBuffer();
        if (cancelled || !hostRef.current) return;

        // Inject a LitLoot title page as the first page of the book
        const JSZip = (window as any).JSZip;
        if (JSZip) {
          const zip = await JSZip.loadAsync(buffer);
          const titleHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title.replace(/</g, "<")}</title>
<style>
  body { display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; font-family: Georgia, serif; text-align: center; }
  h1 { font-size: 2rem; margin: 0 0 0.5rem; }
  p { font-size: 1.1rem; color: #555; margin: 0; }
</style></head>
<body>
  <div>
    <h1>${title.replace(/</g, "<")}</h1>
    <p>by ${author.replace(/</g, "<")}</p>
  </div>
</body></html>`;
          zip.file("title.html", titleHtml);
          // Find and update the OPF to add title.html as the first spine item
          const opfName = Object.keys(zip.files).find((n) => n.endsWith(".opf"));
          if (opfName) {
            let opf = await zip.file(opfName)!.async("string");
            // Add manifest item if not present
            if (!opf.includes('id="litloot-title"')) {
              opf = opf.replace(
                /<\/manifest>/,
                '  <item id="litloot-title" href="title.html" media-type="application/xhtml+xml"/>\n</manifest>'
              );
              opf = opf.replace(
                /<spine[^>]*>/,
                (m: string) => m + '\n    <itemref idref="litloot-title"/>'
              );
            }
            zip.file(opfName, opf);
          }
          const newBuffer = await zip.generateAsync({ type: "arraybuffer" });
          buffer = newBuffer as ArrayBuffer;
        }


        const book = window.ePub(buffer);
        bookRef.current = book;
        await book.ready;
        if (cancelled || !hostRef.current) return;

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
        rendition.themes.default(themeFor(prefs.current.size, prefs.current.night));

        // Strip Project Gutenberg license header and footer from display
        rendition.hooks.content.register((contents) => {
          const doc = contents.document;
          if (!doc) return;
          const remove = (sel: string) => {
            doc.querySelectorAll(sel).forEach((el) => el.remove());
          };
          remove("#pg-header, #pg-footer, .pg-boilerplate, .pgheader");
          // Drop short license markers and PG cross-edition notices.
          // Length guard prevents matching a large parent that merely contains a notice.
          doc.querySelectorAll("div, p, section, h4, table").forEach((el) => {
            const t = (el.textContent || "").trim();
            if (t.length > 600) return;
            if (
              /\*\*\*\s*(START|END)\s+OF\s+THE\s+PROJECT\s+GUTENBERG/i.test(t) ||
              /^The Project Gutenberg eBook of/i.test(t) ||
              /THE FULL PROJECT GUTENBERG.{0,10}LICENSE/i.test(t) ||
              /There are several editions of this ebook in the Project Gutenberg/i.test(t) ||
              /ILLUSTRATED EDITION OF THIS TITLE/i.test(t) ||
              /may be viewed at ebook/i.test(t) ||
              /Click on any of the filenumbers/i.test(t) ||
              /Cover of .*First Edition/i.test(t) ||
              /Title Page of .*First Edition/i.test(t)
            ) {
              el.remove();
            }
          });
        });

        await rendition.display();
        if (cancelled) return;
        setStatus("");

        try {
          await book.locations.generate(1600);
          if (cancelled) return;
          const length = book.locations.length() || 1;
          setTotal(length);
          const start = Math.min(Math.max(startLocation, 0), length - 1);
          if (start > 0) {
            const cfi = book.locations.cfiFromLocation(start);
            await rendition.display(cfi);
            setPage(start + 1);
            setHighest(Math.max(start, maxRef.current));
          }
          const unlocked = await saveProgress({
            childId,
            bookId,
            maxLocation: Math.max(start, maxRef.current),
            totalLocations: length
          });
          applyUnlocks(unlocked ?? []);
        } catch {
          // Book is open; page counts can fail on some catalog EPUBs.
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Could not open the book";
        setLoadError(msg);
        setStatus("");
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, [bookId, childId, epubPath, startLocation]);

  function retry() {
    setLoadError(null);
    setStatus("Loading book…");
    // Force re-run by toggling a key would be cleaner, but we re-trigger via location
    window.location.reload();
  }


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

  function stepSize(dir: -1 | 1) {
    const idx = SIZES.indexOf(size);
    const next = SIZES[idx + dir];
    if (next === undefined) return;
    setSize(next);
  }

  const pct = total ? Math.round(((highest + 1) / total) * 100) : 0;
  const readDelta = Math.max(0, highest - startLocation);

  const active = items.filter((r) => r.status === "active");
  const unlocked = items.filter((r) => r.status === "unlocked");

  const overdueCount = assignments.filter((assignment) => {
    const target =
      assignment.criteria_type === "finish_book"
        ? total
        : Number(assignment.pages ?? 0);
    const done = target > 0 && highest >= target - (assignment.criteria_type === "finish_book" ? 1 : 0);
    return !done && !!assignment.due_date && assignment.due_date < today;
  }).length;

  const allDone = assignments.length > 0 && assignments.every((assignment) => {
    const target =
      assignment.criteria_type === "finish_book"
        ? total
        : Number(assignment.pages ?? 0);
    return target > 0 && highest >= target - (assignment.criteria_type === "finish_book" ? 1 : 0);
  });

  const pageStatus = overdueCount > 0 ? "overdue" : allDone ? "unlocked" : "";
  const sizeIdx = SIZES.indexOf(size);

  return (
    <div>

      {(assignments.length > 0 || active.length > 0) && (
        <p style={{ margin: "0.25rem 0" }}>
          <button type="button" className="btn secondary" style={{ fontSize: "0.85rem", padding: "0.3rem 0.7rem" }}
            onClick={() => setShowDetails((v) => !v)}>
            {showDetails ? "Hide" : "Show"} progress & rewards
          </button>
        </p>
      )}
      {showDetails && assignments.length > 0 && (
        <div className="banner">
          <p className="muted">
            {assignments.length} assignments{" · "}
            <span className={overdueCount > 0 ? "overdue" : "unlocked"}>
              {overdueCount} overdue
            </span>
          </p>
          {assignments.map((assignment) => {
            const target =
              assignment.criteria_type === "finish_book"
                ? total
                : Number(assignment.pages ?? 0);
            const current = target > 0 ? Math.min(highest, target) : highest;
            const done = target > 0 && highest >= target - (assignment.criteria_type === "finish_book" ? 1 : 0);
            const overdue = !done && !!assignment.due_date && assignment.due_date < today;
            const fill = target > 0 ? Math.round((current / target) * 100) : 0;
            const goal =
              assignment.criteria_type === "finish_book"
                ? "Finish this book"
                : `Read ${assignment.pages} pages`;
            const due = dueLabel(assignment.due_date, today, done);
            const statusClass = done ? "unlocked" : overdue ? "overdue" : "";
            return (
              <div key={assignment.id} className="reward-track">
                <p className={statusClass}>
                  {assignment.class_name}: {assignment.title} · {goal}
                  {due ? ` · ${due}` : ""}
                </p>
                <div className="progress-meta" style={{ display: "block" }}>
                  <span className={statusClass}>
                    {done ? "done" : `${current} / ${target || "?"}`}
                  </span>
                  {!done && target > 0 && (
                    <div style={{ display: "block", marginTop: "0.2rem", fontSize: "0.75rem", color: "#666", textAlign: "right" }}>{fill}%</div>
                  )}
                </div>
                {!done && target > 0 && (
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${fill}%` }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {showDetails && active.length > 0 && (
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
                    <div className="progress-meta" style={{ display: "block" }}>
                      <span>
                        {current} / {target}
                        {r.criteria_type === "daily_streak" ? " days" : ""}
                      </span>
                      <div style={{ display: "block", marginTop: "0.2rem", fontSize: "0.75rem", color: "#666", textAlign: "right" }}>{fill}%</div>
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
      <p className={pageStatus}>
        Page {page}
        {total ? ` of ${total}` : ""} · Highest reached {pct}%
      </p>
      {loadError ? (
        <div className="banner" style={{ borderColor: "var(--bad)" }}>
          <p>Could not open the book: {loadError}</p>
          <button type="button" className="btn" onClick={retry}>Try again</button>
        </div>
      ) : status ? <p>{status}</p> : null}
      <div className="reader-tools">
        <button type="button" className="btn secondary" onClick={() => stepSize(-1)} disabled={sizeIdx <= 0}>
          A−
        </button>
        <span className="size">{size}%</span>
        <button type="button" className="btn secondary" onClick={() => stepSize(1)} disabled={sizeIdx >= SIZES.length - 1}>
          A+
        </button>
        <button type="button" className="btn secondary" onClick={() => setNight((on) => !on)}>
          {night ? "Light" : "Night"}
        </button>
      </div>
      <div ref={hostRef} className={night ? "reader night" : "reader"} />
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
            <p style={{ fontSize: "2rem", margin: "0 0 0.25rem" }}>\ud83c\udf89</p>
            <h2>Reward unlocked!</h2>
            {justUnlocked.map((value) => (
              <p key={value} style={{ color: "var(--ink)", fontWeight: 600 }}>
                {value}
              </p>
            ))}
            <p className="muted">Charged to the family balance. Nice work.</p>
            <button type="button" className="btn" onClick={() => setJustUnlocked([])}>
              Keep reading
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
