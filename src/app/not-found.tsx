import Link from "next/link";

export default function NotFound() {
  return (
    <main className="center">
      <div className="card" style={{ maxWidth: 420, textAlign: "center" }}>
        <h1>Page not found</h1>
        <p>That page doesn’t exist or you don’t have access to it.</p>
        <Link href="/" className="btn" style={{ display: "inline-block", textDecoration: "none" }}>
          Go home
        </Link>
      </div>
    </main>
  );
}
