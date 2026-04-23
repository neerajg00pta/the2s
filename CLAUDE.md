# The 2s — 2-Man Team Stableford Tournament

## Project Overview

A mobile-first web app for running a 2-man team modified stableford golf tournament. Built on the [Game Platform Architecture](./game-platform-spec.md) with game-specific customizations defined in [the2s-game-spec.md](./the2s-game-spec.md).

## Tech Stack

- **Frontend:** React 19 + TypeScript (strict mode), Vite
- **Routing:** React Router v7, HashRouter (GitHub Pages)
- **Database:** Supabase (PostgreSQL)
- **Hosting:** GitHub Pages
- **Styling:** CSS Modules, dark golf-themed palette
- **Charts:** Recharts (lightweight, React-native charting)

## Key Architecture Decisions

- Follow the platform spec's provider stack: `DataProvider → AuthProvider → ToastProvider → App`
- No LiveProvider needed (no external API — all manual scoring)
- Scores are entered by players on mobile, not fetched from an API
- All scoring math (net score, points, strokes received) is computed client-side from stored gross scores + hole data + player pops
- Tables: `config`, `users`, `teams`, `holes`, `scores` (no `events` or `selections`)

## Scoring Rules

- **Pops ≤ 18:** 1 stroke on the N hardest holes (hole handicap 1..N)
- **Pops > 18:** 2 strokes on hardest (pops−18) holes, 1 stroke on remaining
- **Points per hole:** max(0, 2 − (gross − par − strokes_received))
- **Double hole:** Points earned × 2 on the designated hole
- **Team score:** Sum of both players' points

## File Structure

```
src/
  lib/
    supabase.ts          # Supabase client singleton
    config.ts            # Environment variables
    data-service.ts      # All Supabase CRUD operations
    scoring.ts           # Stableford scoring logic (pure functions)
    types.ts             # TypeScript interfaces
  contexts/
    DataContext.tsx       # Polls all tables every 10s
    AuthContext.tsx       # Cookie-based email auth
    ToastContext.tsx      # Toast notifications
  components/
    Layout.tsx           # Header + bottom tab bar + admin keystroke
    ScoringPage.tsx      # Mobile scoring UI (hole-by-hole)
    Leaderboard.tsx      # Team + individual leaderboards
    ProgressGraph.tsx    # Team score line chart
    Rules.tsx            # Scoring rules page
    AdminPanel.tsx       # Team/player management
    AdminCourse.tsx      # Hole setup (par, handicap, double hole)
    RegisterModal.tsx    # Self-registration
    Toasts.tsx           # Toast display
  App.tsx                # Routes
  main.tsx               # Entry point with providers
```

## Commands

- `npm run dev` — local dev server
- `npm run build` — TypeScript check + Vite build
- `npm run preview` — preview production build

## Cookie Prefix

`the2s_` — cookies: `the2s_session`, `the2s_admin`

## Supabase Tables

```sql
-- config (single row)
-- users (with pops, team_id)
-- teams
-- holes (number, par, handicap)
-- scores (user_id, hole_number, gross_score)
```

## Important Conventions

- All scoring derivations are pure functions in `scoring.ts` — never store computed values
- Mobile-first design: scoring page optimized for portrait phone use
- 8-char max for display names (last names)
- Hole handicap 1 = hardest hole, 18 = easiest
- Auto-save scores with 800ms debounce
- Green dots for pops indicator, gold 2x badge for double hole
