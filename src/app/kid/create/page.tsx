import Link from "next/link";
import { createKidAccount } from "./actions";

export default async function CreateKidPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const error =
    params.error === "missing"
      ? "Enter a name, age, and a PIN of at least 4 digits."
      : params.error === "taken"
        ? "That name is already in use. Try a different name or sign in."
        : params.error === "young"
          ? "You must be 13 or older to create an account without a parent. Ask a parent to set one up for you."
          : null;

  return (
    <main>
      <header className="top">
        <Link href="/">✨ LitLoot</Link>
      </header>
      <h1>Create a kid account</h1>
      <p>For teens using LitLoot for class assignments. No parent account required. No rewards until a parent claims you.</p>
      {error && (
        <div className="card" style={{ borderColor: "#d32f2f" }}>
          <p>{error}</p>
        </div>
      )}
      <div className="card">
        <form action={createKidAccount} className="stack">
          <label>
            Your name
            <input name="name" required maxLength={40} />
          </label>
          <label>
            Your age
            <input name="age" type="number" min={1} max={18} required />
          </label>
          <label>
            PIN (at least 4 digits)
            <input name="pin" type="password" inputMode="numeric" minLength={4} required />
          </label>
          <button type="submit" className="btn">Create account</button>
        </form>
      </div>
      <p>
        <Link href="/kid/sign-in">Already have an account? Sign in</Link>
      </p>
    </main>
  );
}
