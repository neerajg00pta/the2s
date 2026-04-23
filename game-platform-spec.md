# Game Platform — Architecture Spec

**Purpose:** Reusable blueprint for building private multiplayer game apps. Each game has different rules, UI, and scoring — but they all share the same lifecycle, infrastructure, admin model, and real-time data flow.

---

## 1. The Universal Lifecycle

Every game follows this sequence:

```
CREATE GAME → INVITE PLAYERS → SETUP PHASE → LOCK → GAMEPLAY PHASE → SETTLE
```

### Phase 1: Setup
- Admin creates the game, configures game-specific settings
- Admin creates player accounts, distributes invite links
- Players log in and make their selections (whatever the game requires — claim positions, draft picks, fill brackets, choose numbers)
- Players can self-register via RegisterModal (name + email) when they try to make a selection without being logged in
- Admin can set limits, see who's joined, track who's paid

### Phase 2: Lock
- Admin locks the game — no more player selections
- Admin may trigger randomization or reveals (e.g., assign numbers, shuffle order)
- The game's initial state is frozen

### Phase 3: Gameplay
- Real-world events happen (games played, rounds completed, scores posted)
- Scores/results flow in — either manually entered by admin or auto-fetched from a live API
- The game UI updates in real-time for all players (polling)
- Payouts/standings are computed dynamically as results arrive
- Leaderboard reflects current standings

### Phase 4: Settle
- All events complete, final standings are set
- Admin settles payouts offline
- The app becomes a read-only record of results

---

## 2. Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Frontend** | React 19 + TypeScript (strict mode), Vite 8 | Fast dev, strong typing, great ecosystem |
| **Routing** | React Router v7, HashRouter | HashRouter required for GitHub Pages (no server-side fallback) |
| **Database** | Supabase (PostgreSQL) | Free tier, real-time capable, direct client access |
| **Hosting** | GitHub Pages | Free, zero-config static hosting |
| **Live Data** | Sport/event-specific API (ESPN, PGA, etc.) | Polled client-side, admin-controlled |
| **Auth** | Email-based access codes | Dead simple, no password infrastructure |

### TypeScript Config
- `strict: true` with `noUnusedLocals`, `noUnusedParameters`
- Build script: `tsc -b && vite build` — TypeScript errors fail the build

### Key Dependencies
- `react`, `react-dom` (v19)
- `react-router-dom` (v7)
- `@supabase/supabase-js`
- No component library — plain CSS Modules

---

## 3. Data Architecture

All state lives in Supabase. The frontend reads/writes directly via `supabase-js` with the public anon key. No row-level security needed for private games at this scale.

### Supabase Client
Singleton client, initialized once:
```typescript
// lib/supabase.ts
import { createClient } from '@supabase/supabase-js'
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
```

### Environment Variables
```typescript
// lib/config.ts
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string
```
Vite convention: `VITE_` prefix required for client-side exposure. Loaded via `import.meta.env` (not `process.env`).

### Universal Tables

These exist in every game:

#### `config` (single row)
One row of global settings. Game-specific columns added per project.

| Column | Type | Purpose |
|--------|------|---------|
| `pool_locked` | boolean | When true, setup phase is over — no more player selections |
| `live_scoring` | boolean | Whether external data API polling is active |
| *game-specific settings* | varies | Max selections per player, payout structure, randomization state, etc. |

#### `users`

| Column | Type | Purpose |
|--------|------|---------|
| `id` | text (PK) | Format: `u{Date.now()}` — unique, human-readable prefix |
| `name` | text | Short display name (8-char max, shown in game UI) |
| `full_name` | text | Real name (optional) |
| `email` | text (unique) | The access code / login credential |
| `admin` | boolean | Admin privileges |
| `paid` | boolean | Entry fee collected offline |
| `created_at` | timestamptz | |

#### `events`
The real-world happenings that drive the game (games, rounds, holes, matches — whatever the domain calls them).

| Column | Type | Purpose |
|--------|------|---------|
| `id` | integer (PK) | Sequential |
| `stage` | text | Round/day/phase identifier |
| `status` | text | `scheduled` → `live` → `final` |
| `score_locked` | boolean | Prevents live API from overwriting admin edits |
| `external_id` | text/null | ID from external data API |
| *game-specific fields* | varies | Competitors, scores, results — completely game-dependent |

**Status derivation:** If no explicit status field, derive from scores: both null → `scheduled`, both present → `final`.

#### `selections`
What each player chose during the setup phase. This is the most game-variable table.

| Column | Type | Purpose |
|--------|------|---------|
| *position key(s)* | varies (composite PK) | What was selected (coordinates, draft slot, pick number, etc.) |
| `user_id` | text (FK → users) | Who selected it |
| `selected_at` | timestamptz | When |

The shape of this table changes per game. Examples:
- **Grid game:** `row + col + user_id`
- **Draft game:** `item_id + user_id + pick_order`
- **Bracket game:** `game_id + predicted_winner + user_id`
- **Number game:** `number + user_id`

### Data Service Layer
A dedicated module (`lib/data-service.ts`) wraps all Supabase queries:
- Separate functions per table (CRUD)
- `fetchAllData()` — parallel fetch of all 4 tables via `Promise.all`
- Write functions use an **updater pattern**: pass a function that transforms the current state, then write the result
- All writes followed by `refresh()` to re-sync state

---

## 4. Frontend Architecture

### Provider Stack

Every game wraps the app in the same 4 context providers. **Nesting order matters** — each provider can depend on those above it:

```
<HashRouter>
  <DataProvider>          ← loads first, all others depend on it
    <AuthProvider>        ← needs users from DataProvider
      <ToastProvider>     ← independent, but available to LiveProvider
        <LiveProvider>    ← needs auth, data, and toast
          <Layout>
            <Routes />
          </Layout>
          <Toasts />      ← rendered outside Layout to avoid re-render coupling
        </LiveProvider>
      </ToastProvider>
    </AuthProvider>
  </DataProvider>
</HashRouter>
```

React 19 with `<StrictMode>` wrapping the root in `main.tsx`.

#### Context Hook Guards
Every context exports a hook with a null check:
```typescript
export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used within DataProvider')
  return ctx
}
```
Prevents silent bugs from missing or mis-ordered providers.

#### DataContext (identical across games)
- Holds: `config`, `users`, `selections`, `events`, `loading`, `error`
- **Polling:** `setInterval` every 10 seconds, cleanup on unmount
- **Initial load:** fetches immediately on mount, shows loading gate until complete
- `refresh()` — callable by any component for immediate re-fetch after writes
- **Tick counter:** increments on each successful poll, forces subscriber re-renders even if data hasn't changed shape
- **Error handling:** catches fetch errors, stores in `error` state, but polling continues (doesn't break the cycle)

#### AuthContext (identical across games)
- `login(email)` — match against users table, set session cookie
- `logout()` — clear all cookies (session + admin)
- `activateAdmin()` — returns boolean; sets admin cookie if `currentUser.admin === true`
- `deactivateAdmin()` — clears admin cookie, returns to player mode
- `isAdmin` — derived: `currentUser?.admin && adminActivated`
- Two cookies per game (see Section 5 for details)
- URL param `?token=email` for one-click login (see Section 5)

#### LiveDataContext (game-specific internals, same interface)
- Active only when `config.live_scoring === true`
- Polls external API every 30 seconds
- **Tab visibility:** checks `document.hidden` at start of each poll, silently skips if backgrounded
- Respects `score_locked` per event — skips locked events
- **Auto-lock on manual edit:** when live data is on and admin manually edits a value, that event is automatically locked to prevent API overwrite
- **Matching algorithm is game-specific** but follows the same 3-pass pattern:
  1. By stored `external_id` (most reliable)
  2. By entity name (fuzzy match: normalize, strip suffixes, substring check)
  3. Auto-assign to empty slots in same stage

#### ToastContext (identical across games)
- Three types: `success`, `error`, `info`
- Auto-dismiss after **3500ms**
- Max 3 in queue (new toasts evict oldest: `prev.slice(-2)`)
- Only the **latest toast is rendered** (simple bar, not a stack)
- Each toast gets a unique auto-incrementing ID

### Routes (same structure, different components)

| Path | Purpose | Access |
|------|---------|--------|
| `/` | Login (if no session) or main game view (if logged in) | All |
| `/rules` | Game rules | All |
| `/admin` | Settings + user management | Admin |
| `/admin/events` | Event/data management + live data controls | Admin |

**Route protection:** Admin routes check `isAdmin` and redirect if false. No server-side guards (static site).

### Component Roles

Every game has these components, but **their internals are completely game-specific:**

| Component | Universal Behavior | Game-Specific |
|-----------|-------------------|---------------|
| **GameView** | Shows current game state, updates on poll | Layout, visuals, interaction model (grid, draft board, bracket, etc.) |
| **Leaderboard** | Ranked by winnings, drill-down, current-user pinned, LIVE badges | Payout calculation logic, breakdown format |
| **AdminPanel** | User CRUD, lock/unlock, payment tracking, invite links | Game settings (limits, randomization, game-specific config) |
| **AdminEvents** | Event CRUD, inline editing, live data controls, CSV export | Data fields, status logic |
| **Layout** | Header, nav, login form, logout, loading gate | Branding, colors, game name |
| **RegisterModal** | Name + email signup during setup phase | — |
| **Toasts** | Notification display | — |

---

## 5. Authentication & Session Management

No passwords. No OAuth. No server-side sessions.

### Login Methods

**Method 1: Invite link (primary)**
Admin generates and distributes links like:
```
https://site.github.io/game/#/?token=user@email.com
```
- Note the `#/` — required for HashRouter compatibility
- Link format: `${window.location.origin}${window.location.pathname}#/?token=${email}`

**Method 2: Manual email entry**
- "Sign in" button in the header expands an inline email input (not a separate page or modal)
- Player types email, hits Enter or clicks Go
- On invalid email: input flashes red for 2 seconds, then resets
- On valid: session created, form collapses

**Method 3: Self-registration (setup phase only)**
- If an unregistered player tries to make a selection, a RegisterModal pops up
- Fields: display name (8 char max) + email
- Creates the user account and logs them in simultaneously
- Only available during setup phase (before lock)

### Token URL Handling
```typescript
// On page load:
// 1. Parse token from both search params AND hash params (HashRouter compat)
const params = new URLSearchParams(
  window.location.search || window.location.hash.split('?')[1] || ''
)
const token = params.get('token')

// 2. If token found and no current session, attempt login
// 3. On success: set cookie, then CLEAN THE URL (remove token from history)
window.history.replaceState({}, '', urlWithoutToken)

// 4. On failure (email not found): silent — no error toast
```

### Cookie Implementation
Two cookies per game, namespaced by game prefix:

| Cookie | Value | Expiry | Purpose |
|--------|-------|--------|---------|
| `{game}_session` | email address | 30 days | Player session |
| `{game}_admin` | `"1"` | 30 days | Admin mode activation |

Cookie helpers (inline, no library):
```typescript
function setCookie(name: string, value: string, days: number) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString()
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires};path=/;SameSite=Lax`
}
function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}
function deleteCookie(name: string) {
  document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;SameSite=Lax`
}
```
- Path: `/`, SameSite: `Lax`, no `Secure` flag (works on HTTP for local dev)
- Logout clears both session and admin cookies

### Hidden Admin Activation
No visible admin button or link. Instead, a **hidden keystroke easter egg:**

```typescript
// Layout.tsx — listens globally
const keyBuffer = useRef('')
// On each keydown (outside input/textarea fields):
//   append key to buffer, keep last 5 chars
//   if buffer === 'admin' → call activateAdmin()
```

- Only works if `currentUser.admin === true`
- Shows toast: "Admin mode activated"
- Admin nav links appear in header (Admin, Events, Exit Admin)
- "Exit Admin" button returns to player mode

### Header Nav States
The header has **three conditional states:**

1. **Logged out:** "Sign in" button only
2. **Login form open:** inline email input + Go + cancel (✕)
3. **Logged in (player):** display name + Rules link + Log out
4. **Logged in (admin):** all of #3 + Admin link + Events link + Exit Admin button

---

## 6. Data Flow Patterns

### Polling (all clients)
```
Mount: fetch immediately, show loading spinner
Then every 10 seconds:
  Promise.all([getConfig(), getUsers(), getSelections(), getEvents()])
  → Update all context state
  → Increment tick counter (forces re-renders)
  → Errors caught but don't stop the polling cycle
Unmount: clearInterval
```

### Loading Gate
The entire app is gated behind initial data load:
```typescript
if (loading) {
  return <div className={styles.loading}>
    <div className={styles.spinner} />
    <span>Loading game data...</span>
  </div>
}
```
Nothing renders until the first fetch completes. Prevents flash-of-empty-state.

### Player Selection (setup phase)
```
Player makes selection
  → Set loading state on the specific element (e.g., "claiming" spinner on a cell)
  → Supabase INSERT into selections
  → Success: call refresh(), show success toast
  → Conflict (duplicate PK — someone else got it): show error toast
  → Finally: clear loading state
```
The current implementation sets a `claiming` loading indicator rather than true optimistic UI (it waits for the server). Both patterns work; the key is that the specific element shows feedback immediately.

### Admin Data Entry
```
Admin types in a field
  → Debounced 800ms (trailing) — cancels previous timeout, starts new one
  → After 800ms of no typing: Supabase UPDATE
  → On success: refresh()
  → On failure: error toast "Save failed — will retry"
  → Auto-lock: if live data is on and admin edits a value, that event's score_locked = true
```

### Live Data Flow
```
Every 30 seconds (if config.live_scoring && !document.hidden):
  Fetch from external API
  3-pass matching:
    Pass 1: Match by stored external_id
    Pass 2: Match by fuzzy entity name (normalize, lowercase, strip suffixes, substring)
    Pass 3: Auto-assign unmatched API results to empty event slots in same stage
  For each match with changes:
    Skip if score_locked
    Write updates to Supabase
  Call refresh()
```

---

## 7. Admin Capabilities

### Universal (every game)

#### User Management (inline table)
- **Add player:** click "+Add Player" → inline row appears with fields: Full Name, Display Name (8 char), Email
  - Enter key advances to next field, Escape cancels
  - Auto-submits on blur of last field if required fields are filled
- **Inline edit:** click any cell → turns into input. Enter to commit, Escape to cancel.
  - Validates against other users (e.g., duplicate email check)
  - 8-char limit enforced on display name
- **Delete:** confirm before deleting (cascades to remove their selections)
- **Toggle admin:** checkbox per user
- **Toggle paid:** checkbox per user
- **Copy invite link:** generates `{origin}{path}#/?token={email}`, copies to clipboard
- **Bulk actions:** copy all emails (comma-separated), mailto: link with all players BCC'd

#### Game Controls
- **Lock / Unlock:** toggle `config.pool_locked`
- **Live data toggle:** enable/disable external API polling

#### Payment Tracking
- Simple paid/unpaid boolean per user
- No payment processing — admin collects money offline and updates the flag
- Stats shown: X of Y players paid, total collected

#### CSV Export
Pattern for any CSV download:
```typescript
const csv = [header, ...rows].join('\n')
const blob = new Blob([csv], { type: 'text/csv' })
const url = URL.createObjectURL(blob)
const a = document.createElement('a')
a.href = url
a.download = 'filename.csv'
a.click()
URL.revokeObjectURL(url)
```

### Game-Specific (defined per project)
- Selection limits (max items, max picks, etc.)
- Randomization / reveals (shuffle numbers, assign order, etc.)
- Event creation (how many events, what stages, what fields)
- Payout configuration
- Game-specific admin controls

---

## 8. Leaderboard (Universal Patterns)

The leaderboard exists in every game, though payout logic is game-specific.

### Ranking
- Sorted by total winnings descending, then alphabetically for ties
- **Tie-aware ranks:** only increment rank when winnings drop (3 players tied at $200 all get rank #2, next player gets rank #5)
- Players with $0 still appear

### Current User Pinned
- The logged-in user's row is rendered **separately at the top** with a highlight style
- Then the full list renders below (includes the user again in normal position)
- Gap/divider between pinned row and full list

### Expand/Collapse Drill-Down
- Chevron button on each row toggles payout breakdown
- Breakdown shows: which selection earned money, from which event, what stage, payout amount

### LIVE Badge
- Shown on any row where at least one payout comes from an event with status `live`
- Checks against a `Set<eventId>` of currently-live events

### Polling
- Leaderboard data is derived from DataContext (same 10-second poll)
- Computed values are memoized with `useMemo`

---

## 9. Styling Approach

### Per-Game Theming
Each game gets its own visual identity via CSS custom properties:

```css
/* Base dark theme (shared structure) */
--bg-primary:      /* page background */
--bg-surface:      /* cards, panels */
--bg-elevated:     /* modals, popovers */
--text-primary:    /* main text */
--text-secondary:  /* muted text */

/* Game-specific accents (swap per project) */
--accent-primary:   /* main brand color */
--accent-secondary: /* secondary accent */
--accent-action:    /* CTAs, success states */
--accent-danger:    /* errors, warnings */
--accent-live:      /* live/active indicators */

/* Layout sizes */
--cell-size:        /* game element size, desktop */
--cell-size-mobile: /* game element size, mobile */
```

### Component Styling
- **CSS Modules** (`.module.css`) per component — no global class collisions
- BEM-like naming within modules: `.cell`, `.cellClaimed`, `.cellMine`, `.cellDimmed`
- Responsive: mobile-first, desktop enhancement
- Animations: subtle feedback (flash on selection, pulse on live events)

### Viewport Configuration
```html
<meta name="viewport" content="width=device-width, initial-scale=0.6, minimum-scale=0.25" />
```
Initial scale zoomed out to fit game UIs on mobile. Adjust per game.

### What Changes Per Game
- Color palette (accents, gradients, heat maps)
- Game view layout (grid vs. list vs. bracket vs. draft board)
- Typography choices
- Icon set / imagery in header
- Mobile interaction patterns (scroll vs. tap vs. swipe)
- Element sizes (cell dimensions, spacing)

---

## 10. Performance Patterns

### Memoization
All expensive computations use `useMemo` with explicit dependency arrays:
- Payout calculations (sum across events per player)
- Lookup maps (see below)
- Filtered/sorted lists
- Derived state (ranks, status badges, heat map values)

### Lookup Maps
Build `Map<string, T>` objects for O(1) lookups instead of repeated `array.find()`:
```typescript
const selectionMap = useMemo(() => {
  const map = new Map<string, Selection>()
  selections.forEach(s => map.set(`${s.key}`, s))
  return map
}, [selections])
```
Used for: selection ownership checks, user-by-ID, event-by-ID, etc.

### Deterministic Player Colors
Each user gets a consistent color across all views, derived from their ID:
```typescript
export function ownerColor(userId: string): string {
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0
  }
  return PALETTE[Math.abs(hash) % PALETTE.length]
}
```
10-color palette. No storage needed. Same user always gets same color.

---

## 11. Deployment

### GitHub Pages + GitHub Actions

```yaml
# .github/workflows/deploy.yml
on:
  push:
    branches: [main]
  workflow_dispatch:  # manual trigger

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'npm'
      - run: npm ci
      - run: npm run build
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
      - uses: actions/deploy-pages@v4
```

### Build Script
```json
"build": "tsc -b && vite build"
```
TypeScript check runs first — build fails on type errors.

### Vite Config
```typescript
export default defineConfig({
  plugins: [react()],
  base: '/<repo-name>/',  // trailing slash, must match GitHub repo name
})
```

### Secrets
| Variable | Source | Purpose |
|----------|-------|---------|
| `VITE_SUPABASE_URL` | GitHub repo secrets + local `.env` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | GitHub repo secrets + local `.env` | Public anon key (safe to expose) |

Each game gets its own Supabase project (free tier) and GitHub repo.

---

## 12. Project Setup Checklist

For each new game:

1. **Create GitHub repo** from template (or clone scaffold)
2. **Create Supabase project** (free tier), run table creation SQL for `config`, `users`, `events`, `selections`
3. **Define game-specific pieces:**
   - Selection model (what players choose, how `selections` table is shaped)
   - Event model (what fields on `events`, how many, what stages)
   - Score-to-outcome mapping (how event results determine winners/payouts)
   - Payout structure (amounts per stage/round)
   - Game view component (the main visual — grid, board, bracket, etc.)
   - External data API integration (endpoints, matching logic, entity normalization)
   - Color palette and branding (accent colors, typography)
4. **Configure GitHub Actions** with Supabase secrets
5. **Set viewport meta** `initial-scale` appropriate for the game UI
6. **Admin creates game** → invites players → go

---

## 13. Proven Patterns

Validated in production with real users:

1. **10-second polling is plenty.** No WebSockets needed at this scale (~50-100 users).
2. **Optimistic UI for selections.** Show loading indicator on the specific element, revert on conflict. Feels instant.
3. **Debounced admin inputs (800ms).** Trailing debounce with timeout cancel. Prevents excessive writes while typing.
4. **Score locking is essential.** When live data is on and admin manually edits, auto-lock that event to prevent API overwrite.
5. **3-pass matching for live data.** External ID → fuzzy name → auto-assign empty slots. Handles rescheduled events and items the admin hasn't pre-created.
6. **HashRouter, not BrowserRouter.** GitHub Pages doesn't support SPA fallback routing.
7. **Single-row config table.** Simpler than key-value. Just add columns per game.
8. **Cookie sessions (30-day).** Players don't re-auth constantly. Survives tab closes and browser restarts.
9. **`?token=` invite links with URL cleanup.** One-click login. Token removed from URL after use via `replaceState` so it doesn't linger in browser history.
10. **Deterministic player colors by ID hash.** Consistent across views, no storage needed.
11. **Loading gate.** Block the entire UI until initial data fetch completes. Prevents flash-of-empty-state.
12. **Context hook guards.** Every `useX()` hook throws if used outside its provider. Catches wiring bugs immediately.
13. **Inline editing pattern.** Admin table cells are click-to-edit with keyboard handling (Enter commits, Escape cancels). No separate edit forms or modals.
14. **Memoized lookup maps.** Build `Map` objects for O(1) lookups instead of `array.find()`. Re-derive on dependency changes via `useMemo`.

---

## 14. Out of Scope (by design)

Intentionally excluded to keep each game simple and shippable:

- WebSocket real-time updates (polling is enough)
- Payment processing (offline)
- User self-registration outside setup phase (admin creates accounts; RegisterModal only available before lock)
- Multiple games per deployment (one repo = one game)
- OAuth / social login
- Server-side rendering
- Native mobile apps
- Persistent backend server (static site + Supabase only)
- Row-level security in Supabase (not needed at this scale with private games)
