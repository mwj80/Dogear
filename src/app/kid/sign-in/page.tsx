import Link from "next/link";
import { signInKid } from "./actions";

export default async function KidSignInPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const error =
    params.error === "missing"
      ? "Enter your name and PIN."
      : params.error === "no"
        ? "That name and PIN did not match. Ask a parent to check the PIN."
        : null;

  return (
    <main>
      <header className="top">
        <Link href="/">✨ LitLoot</Link>
      </header>
      <h1>Kid sign in</h1>
      <p>Use the name and PIN a parent set for you.</p>
      {error && (
        <div className="card" style={{ borderColor: "#d32f2f" }}>
          <p className="overdue">{error}</p>
        </div>
      )}
      <div className="card">
        <form action={signInKid} className="stack">
          <input type="hidden" name="next" value={params.next ?? ""} />
          <label>
            Your name
            <input name="name" required maxLength={40} autoComplete="username" />
          </label>
          <label>
            PIN
            <input
              name="pin"
              required
              inputMode="numeric"
              pattern="[0-9]{4}"
              maxLength={4}
              autoComplete="current-password"
              placeholder="4 digits"
            />
          </label>
          <button type="submit" className="btn">
            Sign in
          </button>
        </form>
      </div>
    </main>
  );
}
