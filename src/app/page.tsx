import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";
import Link from "next/link";

export default function HomePage() {
  return (
    <main>
      <header className="top">
        <div className="brand">
          <strong>✨ LitLoot</strong>
          <small>Read pages. Earn loot.</small>
        </div>
        <span>
          <SignedOut>
            <SignInButton mode="redirect">
              <button type="button" className="btn">
                Parent sign in
              </button>
            </SignInButton>
          </SignedOut>
          <SignedIn>
            <Link href="/parent">Parent dashboard</Link>
            <UserButton />
          </SignedIn>
        </span>
      </header>
      <h1>Reading rewards</h1>
      <p>
        Parent-funded reading rewards — kids read real books, unlock Robux, gift cards, and more.
      </p>
      <div className="card">
        <SignedOut>
          <p>Phase 1: create a parent account to continue.</p>
          <p>
            <Link href="/sign-up">Create parent account</Link>
            {" · "}
            <Link href="/sign-in">Sign in</Link>
          </p>
        </SignedOut>
        <SignedIn>
          <p>You are signed in.</p>
          <p>
            <Link href="/parent">Go to parent dashboard</Link>
          </p>
        </SignedIn>
      </div>
    </main>
  );
}
