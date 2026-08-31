# Phase 1 tickets

Do these in order. Each ticket should leave the app runnable.

## P1-0 — Repo plumbing
- Next.js + TypeScript app in `apps/web` or repo root
- `.env.example` with `DATABASE_URL` and auth keys
- README start commands

## P1-1 — Database
- Apply `docs/schema.sql` (or Prisma schema matching it)
- Seed 3 public-domain books (Alice, Oz, Peter Pan) with EPUB paths

## P1-2 — Auth + household
- Parent can sign up / sign in
- Creating a parent user also creates a Household with pot `0`
- Parent can create a Child (display name + optional PIN)

## P1-3 — Catalog + reader
- Child can open a seeded EPUB
- Paginated epub.js viewer
- Persist `Progress.max_location` / `total_locations`
- Font size + night mode stored on Child or browser

## P1-4 — Finish-book reward
- Parent creates a reward: type + face value + specific book + `finish_book`
- Cost stored using default rates (800 Robux → $6.00, etc.)
- Child sees the challenge + progress bar
- On last page: status `unlocked`, ledger spend, pot decrement (allow shortfall)

## P1-5 — Parent monitoring
- List kids, active/unlocked rewards
- Mock load pot (+$5 / +$10 / +$25)
- Soft warning if active reward costs exceed pot

## Done when
- Reset-style seed script optional
- Parent → child → finish Alice → reward unlocks and pot moves
- Back/forward does not double-count pages
