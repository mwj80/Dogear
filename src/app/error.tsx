"use client";

export default function ErrorBoundary({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="center">
      <div className="card" style={{ maxWidth: 420, textAlign: "center" }}>
        <h1>Something went wrong</h1>
        <p>We hit a snag loading this page. Nothing was lost.</p>
        <p className="muted" style={{ fontSize: "0.85rem" }}>
          {error.message || "Unexpected error"}
        </p>
        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center", marginTop: "1rem" }}>
          <button type="button" className="btn" onClick={() => reset()}>
            Try again
          </button>
          <a href="/" className="btn secondary" style={{ textDecoration: "none" }}>
            Home
          </a>
        </div>
      </div>
    </main>
  );
}
