# Reading rewards app (working name TBD)

Parent-funded reading rewards. Kids read real books. Teachers can assign and track.

**Spec:** [PRODUCT_SPEC.md](./PRODUCT_SPEC.md)  
**Agent rules:** [AGENTS.md](./AGENTS.md)  
**Phase 1 tickets:** [docs/PHASE1.md](./docs/PHASE1.md)

The hosted single-file demo is a UX reference only. Do not use `localStorage` as the production data model.

## Phase 1 goal

A parent can sign in, create a child, open a catalog EPUB, and unlock a **finish this book** reward. Progress is stored in Postgres. The pot is mock dollars (no real payments).

## Suggested stack

- Next.js (App Router) + TypeScript
- Postgres (Neon or Supabase)
- Auth: Clerk or Supabase Auth
- Reader: epub.js, paginated, ~700 characters per app page

## Local setup (after scaffold is implemented)

```bash
cp .env.example .env.local
npm install
npx prisma migrate dev   # or equivalent
npm run dev
```

## Demo prototype

Keep the existing hosted HTML demo for walkthroughs. This repo is the production codebase.
