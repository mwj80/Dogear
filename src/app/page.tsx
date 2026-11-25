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
          <Link href="/kid/sign-in">Kid sign in</Link>
          {" · "}
          <Link href="/kid/create">Create kid account</Link>
          <SignedOut>
            <SignInButton mode="redirect" forceRedirectUrl="/role">
              <button type="button" className="btn">
                Sign in
              </button>
            </SignInButton>
          </SignedOut>
          <SignedIn>
            <Link href="/parent">Parent</Link>
            {" · "}
            <Link href="/teacher">Teacher</Link>
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
          <p>Parents fund rewards. Teachers assign books. Kids read and earn.</p>
          <p>
            <Link href="/sign-up">Create account</Link>
            {" · "}
            <Link href="/sign-in">Sign in</Link>
            {" · "}
            <Link href="/kid/sign-in">Kid sign in</Link>
            {" · "}
            <Link href="/kid/create">Create kid account</Link>
          </p>
          <p>
            <Link href="/sign-in?redirect_url=/role">I'm a teacher</Link>
          </p>
        </SignedOut>
        <SignedIn>
          <p>You are signed in.</p>
          <p>
            <Link href="/parent">Parent dashboard</Link>
            {" · "}
            <Link href="/teacher">Teacher dashboard</Link>
            {" · "}
            <Link href="/role">Change role</Link>
          </p>
        </SignedIn>
      </div>
    </main>
  );
}
