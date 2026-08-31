# Product spec — reading rewards app (working name TBD)

**Status:** Phase 0 → Phase 1  
**Date:** 2026-08-31  
**Source of truth:** This spec. The single-file HTML prototype is a UX reference only.

Working name is unset (avoid “Book It”). Prototype nickname in conversation: BookIt-style reader.

---

## 1. Problem

Kids read more when progress is visible and rewards are real. Parents want control over *what* is earned and *how much* it costs. Teachers want assigned reading that is trackable without becoming a second gradebook.

## 2. Product one-liner

Parents fund a reward pot. Kids read real books in-app. The system releases parent-defined rewards when reading criteria are met. Teachers can assign books and see class progress.

## 3. Roles

| Role | Can do | Cannot do (v1) |
|------|--------|----------------|
| **Admin** | Set conversion rates (Robux $/100, gift-card multiplier, pizza fixed cost, custom default). Optional org-level catalog later. | Spend a family’s pot. Edit a child’s reading log. |
| **Parent** | Create/link children, load pot (mock $ in v1), create rewards, set daily page goal, view progress (bars, 14-day chart, calendar). | Change admin rates. See other families. |
| **Child** | Read catalog books, see own assignments + rewards, change font size / night mode. | Edit pot, rates, other kids’ data, teacher roster. |
| **Teacher** | Create a class, add students (linked child accounts), create assignments, view class board. | Fund pots or create parent rewards. |

One adult may hold more than one role (parent + teacher) on separate profiles.

## 4. Core loop

1. Admin publishes conversion rates.  
2. Parent loads pot and creates one or more rewards for a specific child.  
3. Teacher (optional) assigns a book + criterion to class members.  
4. Child reads. Progress is stored per child × book.  
5. When a reward or assignment criterion is met, status becomes **unlocked / complete**.  
6. On reward unlock, pot is debited by the **admin-calculated cost** (read-only for parent).  
7. Parent and teacher dashboards reflect the same underlying progress.

## 5. Reading & progress rules

### Books
- Catalog items have `id`, `title`, `author`, `source_url` or stored EPUB, `format` (`epub`).  
- v1 catalog: public-domain EPUBs served same-origin (Alice, Oz, Peter Pan as seeds).  
- Page counts are **app pages**, not print pages.

### What a “page” is
- EPUB locations generated at ~**700 characters** per location (tunable constant `CHARS_PER_PAGE`).  
- The reader uses **paginated** layout: one viewport ≈ one page turn.  
- `total_pages` is derived after first generateLocations / equivalent.

### What counts
- Credit only the **highest location index reached** in that book for that child (`max_location`).  
- Going back and forward does **not** add pages.  
- Session counter increments only on **new** max location.  
- Tab blur pauses the reading timer.  
- Rapid turns may show a warning; they still only advance `max_location` once.

### Daily log
- When `max_location` increases, add the delta to `daily_pages[child_id][YYYY-MM-DD]`.  
- Calendar / chart / streaks use this log.  
- Parent sets `daily_goal_pages` per child (default 5).

### Anti-spam (v1 minimum)
- Highest-page-only.  
- Optional later: minimum seconds per new page before it counts toward *rewards* (still allow navigation).

## 6. Rewards

Created by a parent, owned by one child.

### Fields
- `child_id`
- `title` / display value (what the child sees), e.g. “800 Robux”
- `reward_type`: `robux` | `gift_card` | `pizza` | `custom`
- `face_value` (string or number; kid-facing)
- `cost_cents` — **computed from admin rates at create time**, stored immutably on the reward
- `scope`: `any_book` | `book_id`
- `criteria` (see below)
- `status`: `active` | `unlocked`
- `unlocked_at` (nullable)

Parent does **not** edit `cost_cents`. Changing admin rates does **not** rewrite existing rewards.

### Criteria (v1)

| Type | Params | Complete when |
|------|--------|----------------|
| `finish_book` | requires `scope = book_id` | `max_location >= total_pages - 1` (or 100% locations) |
| `total_pages` | `n` | Sum of pages credited (scope any = all books; else that book’s `max_location+1`) ≥ `n` |
| `daily_streak` | `pages_per_day`, `days` | Consecutive calendar days where daily log ≥ `pages_per_day`. If today is incomplete, do not break yesterday’s streak; today is “in progress.” |

Max active rewards per child in prototype was 3–4; production can start at **10 active**.

### Pot
- Currency: USD cents (integer).  
- Parent “loads” funds (v1: mock credit, no card processor).  
- On unlock: `pot.available -= reward.cost_cents`; write a ledger row.  
- If `available < cost`, still unlock in v1 and record `shortfall_cents` (same as prototype). Production may later block unlock until funded.  
- **Soft warning** when sum of `cost_cents` of active rewards > `available`.

### Admin rates (defaults from prototype)
- Robux: dollars per 100 Robux (default **0.75** → 800 Robux = $6.00)  
- Gift card: multiplier on face value (default **1.10**)  
- Pizza coupon: fixed dollars (default **4.00**)  
- Custom: default dollars (default **5.00**)

Formula examples:
- Robux cost = `ceil(robux_amount / 100 * dollars_per_100 * 100)` cents  
- Gift card cost = `round(face_dollars * multiplier * 100)` cents  

## 7. Teacher assignments

- Teacher has one class in v1 (name string).  
- Roster: links existing child accounts (parent must have created the child).  
- Assignment: `title`, `book_id`, criterion (`finish_book` or `total_pages` + n), optional `due_date`.  
- Progress is **derived** from the same `child × book` progress as rewards — no second counter.  
- Board statuses: `not_started` | `in_progress` | `done` (+ percent).  
- Child sees assignments in a separate list from parent rewards.  
- Teacher cannot grant parent rewards or touch the pot.

## 8. Family linking (Phase 1 minimum)

- Parent account is the household owner.  
- Children are **not** independent email accounts in v1 if under 13: parent creates a child profile; child signs in with a **parent-issued PIN or magic link** the parent controls.  
- Optional later: join code so a second device attaches as that child.  
- Teacher adds students by parent-approved link or class code the parent accepts.

## 9. Data model

IDs are UUIDs. Money is integer cents. Dates are `YYYY-MM-DD` in the child’s local timezone (store timezone on child or household).

```
User
  id, email, role_flags (admin/parent/teacher), created_at

Household
  id, parent_user_id, pot_available_cents, pot_loaded_cents

Child
  id, household_id, display_name, daily_goal_pages, timezone, pin_hash?, created_at

AdminRates
  id (singleton or per-org), robux_dollars_per_100, gift_multiplier,
  pizza_fixed_dollars, custom_default_dollars, updated_at

Book
  id, title, author, slug, epub_path, chars_per_page, created_at

Progress
  child_id, book_id
  max_location, total_locations, seconds_reading, updated_at
  UNIQUE(child_id, book_id)

DailyPages
  child_id, date, pages
  UNIQUE(child_id, date)

Reward
  id, household_id, child_id, type, face_value, cost_cents,
  scope (any|book_id), book_id?,
  criteria_type, criteria_json,
  status, unlocked_at, shortfall_cents?

Ledger
  id, household_id, kind (load|spend), amount_cents, reward_id?, note, created_at

Class
  id, teacher_user_id, name

Enrollment
  class_id, child_id, UNIQUE(class_id, child_id)

Assignment
  id, class_id, title, book_id, criteria_type, criteria_json, due_date?

# AssignmentCompletion is computed, not stored, unless you cache it.
```

### Derived views
- Reward progress percent from criteria + Progress + DailyPages.  
- Weekly pages = sum DailyPages where date ≥ today−6.  
- Overcommit = sum(active reward cost_cents) − pot_available_cents.  
- Assignment % from Progress for that book.

## 10. Screens (v1)

**Home / auth** — sign in; role switcher if user has multiple roles.

**Admin** — rate form, live preview (800 Robux, $10 gift card), save.

**Parent dashboard**
- Summary strip: kids count, pages this week, unlocked/active rewards, pot + committed  
- Pot: load +$5/+10/+25/custom, ledger  
- Overdraw warning  
- Kid list → kid detail  

**Parent kid detail**
- Rewards + bars  
- Daily goal  
- 14-day bar chart (green = goal met)  
- Month calendar (blue = some reading, green = goal, today outlined)  
- Remove child  

**Parent create reward**
- Child, type, face value, scope (any vs book), criteria  
- Cost preview (read-only)  
- Confirm if this reward would overcommit the pot  

**Child**
- Who am I (if multiple profiles on device)  
- School assignments  
- Parent challenges with bars  
- Book tabs  
- EPUB reader + prev/next + font + night mode  
- Unlock celebration  

**Teacher**
- Class name, roster add/remove  
- Create assignment  
- Progress board (student × assignment)

## 11. Non-goals for Phase 1

- Real card charges, Roblox API, gift-card vendors, Pizza Hut coupons  
- Native iOS/Android (responsive web + PWA is enough)  
- Full school SIS / Google Classroom roster sync  
- Social features, chat, public profiles  
- DRM bookstore / paid titles  
- Changing cost after a reward is created  
- Auto-updating face value when cost changes (cost is never parent-editable)

## 12. Compliance notes (design constraints, not legal advice)

- Assume COPPA if any user is under 13: parental consent, minimal data, no third-party ads, no selling kid data.  
- Teacher view is limited to enrolled students.  
- Do not put reading comprehension answers or free-text from kids in v1.  
- Logs: pages and timestamps only.  
- Get counsel before school pilots or real payments.

## 13. Success metrics (early)

- Child reaches first unlock without parent help on the reader.  
- Parent can explain pot vs cost in one sentence.  
- Teacher board matches what the child sees for the same book.  
- No double-count on back/forward page turns.

## 14. Implementation note for agents

Implement against **this spec**, not the prototype’s localStorage keys. Reuse prototype UX copy and flows where they match. EPUB reader: epub.js, paginated flow, ~700 chars/location, highest-location progress.

Phase 1 slice: auth + household + children + books + progress + one reward type (`finish_book`) + mock pot. Then rates, other criteria, teacher.
