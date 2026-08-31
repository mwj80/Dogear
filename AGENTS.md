# Agent instructions

You are implementing a production web app from PRODUCT_SPEC.md.

## Rules

1. PRODUCT_SPEC.md is the source of truth.
2. Implement **Phase 1 only** unless the user asks otherwise.
3. Phase 1 = auth, household, children, book catalog, EPUB reader, progress (highest location only), one reward type (`finish_book`), mock pot + ledger, parent dashboard basics.
4. Do not port the prototype’s `localStorage` keys or single-file architecture.
5. Money is integer cents.
6. Child accounts are parent-managed (PIN or magic link). No independent email for under-13 in Phase 1.
7. Cost from pot is computed from admin rates and stored on the reward. Parents cannot edit cost. Rates can wait until Phase 1.1 if needed; until then hardcode prototype defaults.
8. Page credit = highest EPUB location index reached per child×book. Never increment on back/forward.
9. Prefer small PRs and working vertical slices over large rewrites.

## Phase 1.1 (only when Phase 1 works)

Admin rates UI, `total_pages` and `daily_streak` criteria, daily log + calendar, teacher role.

## Out of scope

Real payments, Roblox/gift-card APIs, native apps, SIS sync, paid/DRM books.
