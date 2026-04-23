# The 2s — Game Spec

**Game:** 2-Man Team Modified Stableford Tournament
**Platform:** Built on the [Game Platform Architecture](./game-platform-spec.md)

---

## 1. Game Overview

Teams of 2 players compete over 18 holes of golf. Each player earns Stableford points based on their net score (gross score adjusted for handicap strokes). Team score is the sum of both players' points. One designated hole awards double points.

---

## 2. Scoring Rules

### Handicap Strokes ("Pops")

Each player has a handicap number called **pops**. Strokes are distributed across holes based on **hole handicap rankings** (1 = hardest, 18 = easiest):

| Pops Range | Stroke Distribution |
|-----------|-------------------|
| 0 | No strokes on any hole |
| 1–18 | 1 stroke on the N hardest holes (hole handicap 1 through N) |
| 19–36 | 2 strokes on the hardest (pops − 18) holes, 1 stroke on the remaining holes |

**Example:** A player with 12 pops gets 1 stroke on holes ranked handicap 1–12. A player with 21 pops gets 2 strokes on holes ranked 1–3, and 1 stroke on holes ranked 4–18.

### Point Calculation

For each hole:
1. **Net score** = gross score − par − strokes received on that hole
2. **Points** = max(0, 2 − net score)

| Net Score vs Par | Points |
|-----------------|--------|
| Net eagle (−2) | 4 |
| Net birdie (−1) | 3 |
| Net par (0) | 2 |
| Net bogey (+1) | 1 |
| Net double bogey or worse (+2+) | 0 |

### Double Points Hole

One hole is designated pre-tournament as the **double points hole**. Any points earned on that hole are multiplied by 2.

### Team Scoring

**Team points** = sum of both players' individual points across all holes played.

---

## 3. Data Model

### Supabase Tables

#### `config` (single row)

| Column | Type | Purpose |
|--------|------|---------|
| `id` | integer (PK) | Always 1 |
| `pool_locked` | boolean | When true, no more setup changes |
| `live_scoring` | boolean | Not used (manual scoring only), kept for platform compat |
| `double_hole` | integer (1–18) | Which hole awards double points |
| `course_name` | text | Name of the golf course |
| `tournament_name` | text | Tournament name (e.g., "The 2s 2026") |

#### `users`

Standard platform `users` table plus:

| Column | Type | Purpose |
|--------|------|---------|
| `id` | text (PK) | `u{timestamp}` |
| `name` | text | Display name (last name, 8-char max) |
| `full_name` | text | Full name |
| `email` | text (unique) | Login credential |
| `admin` | boolean | Admin flag |
| `paid` | boolean | Payment tracking |
| `pops` | integer | Player's handicap strokes (0–36) |
| `team_id` | text (FK) | Which team this player belongs to |
| `created_at` | timestamptz | |

#### `teams`

| Column | Type | Purpose |
|--------|------|---------|
| `id` | text (PK) | `t{timestamp}` |
| `name` | text | Display name (e.g., "Severson/Gupta") |
| `created_at` | timestamptz | |

#### `holes`

| Column | Type | Purpose |
|--------|------|---------|
| `number` | integer (PK) | Hole number 1–18 |
| `par` | integer | Par for the hole (3, 4, or 5) |
| `handicap` | integer (unique) | Difficulty ranking 1–18 (1 = hardest) |

#### `scores`

This replaces the platform's generic `selections` and `events` tables — scores are both player input and game state:

| Column | Type | Purpose |
|--------|------|---------|
| `user_id` | text (FK → users, composite PK) | Player |
| `hole_number` | integer (FK → holes, composite PK) | Hole 1–18 |
| `gross_score` | integer | Raw strokes on the hole |
| `updated_at` | timestamptz | Last edit time |

**Derived (not stored):**
- `strokes_received` — computed from player pops + hole handicap
- `net_score` — `gross_score − par − strokes_received`
- `points` — `max(0, 2 − net_score)` × (2 if double hole, else 1)

---

## 4. Admin Setup Flow

### Pre-Tournament Setup

1. **Course Setup:** Enter course name, set par and handicap rank for each of the 18 holes
2. **Teams & Players:** Create teams, add 2 players per team with their pops
3. **Double Hole:** Select which hole (1–18) is the double points hole
4. **Lock:** Lock the tournament to begin play

### Admin Pages

- **Admin Panel** (`/admin`): Team/player management, pops editing, lock/unlock, payment tracking
- **Course Setup** (`/admin/course`): Hole pars, handicap rankings, double hole selection

---

## 5. Scoring Page (Mobile-First)

The primary player-facing UI. Optimized for phone portrait mode.

### Layout (top to bottom)

```
┌─────────────────────────┐
│  Hole 7    Par 4   2x   │  ← hole number, par, double badge if applicable
│         ●                │  ← green dot(s) for pops on this hole
├─────────────────────────┤
│                         │
│      [ − ]  5  [ + ]   │  ← large +/− buttons, gross score in center
│                         │
├─────────────────────────┤
│  Net: −1   Pts: 3      │  ← net score and points for this hole
├─────────────────────────┤
│  My Total: 24 pts       │  ← running total for this player
│  Team Total: 51 pts     │  ← running total for the team
├─────────────────────────┤
│  ← Hole 6    Hole 8 →  │  ← swipe or tap arrows to navigate
└─────────────────────────┘
```

### Interaction Details

- **+/− buttons:** Large touch targets (min 48px), increment/decrement gross score
- **Score range:** 1 to 15 (clamped)
- **Default score:** Par for the hole (pre-filled but editable)
- **Pops indicator:**
  - No dot = no strokes on this hole
  - Single green dot (●) = 1 stroke
  - Double green dot (●●) = 2 strokes
- **2x badge:** Prominent badge shown on the double points hole
- **Auto-save:** Debounced 800ms write to Supabase after score change
- **Navigation:** Swipe left/right or tap arrow buttons to move between holes
- **Hole dots:** Row of 18 small dots at the top showing which holes have scores entered

### Score Summary Strip

A compact row at the bottom of the scoring view showing all 18 holes as small cells with score/points visible.

---

## 6. Leaderboards

### Team Leaderboard

| Column | Description |
|--------|-------------|
| **Team** | Team name (e.g., "Jagger/Zeigler") |
| **Points** | Total team stableford points |
| **Behind** | Points behind leader ("−" for 1st place) |
| **Thru** | Min holes completed by either player on the team |

Sorted by points descending.

### Individual Leaderboard

| Column | Description |
|--------|-------------|
| **Player** | Last name with pops in parens, e.g., "Dougherty (6)" |
| **Points** | Total stableford points |
| **Net** | Aggregate net score vs par with +/− sign |
| **Thru** | Holes completed |

Sorted by points descending, then net ascending for tiebreak.

### Display

- Current user's row pinned/highlighted at top (if logged in)
- Compact table format matching the spreadsheet style from the reference image
- Auto-refreshes on 10-second polling

---

## 7. Team Score Progression Graph

Line chart showing cumulative team points through the round:

- **X-axis:** Hole number (1–18)
- **Y-axis:** Cumulative team points
- **Lines:** One per team, each with a distinct color and team name in legend
- **Data points:** Dots at each hole with score data
- **Updates:** Recalculated on each data refresh

Chart rendered client-side (lightweight library or canvas — no heavy dependencies). Reference image shows a clean line chart with dots at each data point, legend at top.

---

## 8. Navigation Structure

| Path | View | Access |
|------|------|--------|
| `/` | Login or Scoring page | All |
| `/leaderboard` | Team + Individual leaderboards | All |
| `/graph` | Team score progression chart | All |
| `/rules` | Scoring rules explanation | All |
| `/admin` | Team/player management | Admin |
| `/admin/course` | Hole setup, double hole | Admin |

### Bottom Tab Bar (mobile)

Persistent bottom navigation with icons:
- **Score** (pencil icon) — scoring page
- **Leaderboard** (trophy icon) — leaderboards
- **Graph** (chart icon) — progression chart

---

## 9. What's NOT Needed

- No live external data API (all scores entered manually)
- No payment processing (offline)
- No bracket/grid/draft mechanics
- No randomization
- No `events` table (holes serve as the event structure)
- No `selections` table (scores serve as selections)

---

## 10. Tech Stack Additions

On top of the platform stack:

| Addition | Purpose |
|----------|---------|
| Lightweight chart lib (e.g., Chart.js or Recharts) | Team progression graph |
| Touch gesture handling | Swipe between holes on mobile |

---

## 11. Color Palette

Golf-themed dark mode:

| Variable | Value | Purpose |
|----------|-------|---------|
| `--accent-primary` | `#2E7D32` | Golf green — primary brand |
| `--accent-secondary` | `#FFD700` | Gold — highlights, double hole |
| `--accent-action` | `#43A047` | Success/confirm actions |
| `--accent-danger` | `#E53935` | Errors, warnings |
| `--accent-live` | `#FFC107` | Active/live indicators |
| `--bg-primary` | `#0a0f0a` | Dark green-black background |
| `--bg-surface` | `#1a2e1a` | Card surfaces |
| `--bg-elevated` | `#2a3e2a` | Elevated surfaces |
