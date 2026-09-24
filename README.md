# DDAM ESPORT CUP — DOTA 2 & CS2 Tournament Hub

One Vercel website with separate real-time DOTA 2, CS2 and additional game
tournament boards. The launcher is at `/`; the dedicated boards are
`/dota2.html`, `/cs2.html` and `/additional-games.html`. The additional board
contains live scorecards for Mobile Legends, Meccha Chameleon, Stumble Guys,
PUBG Mobile, Tekken 7 and Tetris. Rules are summarized at `/games.html`, with the full
Mobile Legends rules at `/mobile-legends.html`.

## Tournament boards

- **DOTA 2:** two editable zones with BO2 round-robin matches followed by the
  existing BO3 playoff bracket.
- **CS2:** six-team Group BO1 round robin (15 matches), two Lower BO1 qualifiers,
  then two BO3 semifinals, a Grand Final and a 3rd Place Final (4 matches) for places 1–4.
- **Additional live boards:** one public realtime page with tabs for Mobile
  Legends, Meccha Chameleon, Stumble Guys, PUBG Mobile, Tekken 7 and Tetris. Admins can
  edit team names, series results, player points and map scores from the page.
  Saving one game merges into the live board instead of replacing it, so two
  admins editing different games can no longer overwrite each other.
- **Tekken 7:** a full tournament app inside the Tekken tab — see
  [Tekken 7 board](#tekken-7-board) below.
- **Mobile Legends:** six teams split into two BO2 groups, then A1 vs B2 and
  B1 vs A2 BO3 semifinals, Grand Final and 3rd Place Final.
- **Meccha Chameleon:** six teams with 2 women + 2 men each, split into a women’s
  and men’s lobby. Each lobby has six rounds; Hider scores come from Missed Spot
  Ranking and Seeker scores use 0.33 per caught Hider plus a 2-point clean-sweep bonus.

## Tekken 7 board

`/additional-games.html?game=tekken` loads a complete Tekken tournament app
(`src/tekken`, TypeScript) into the tab. It has its own sub-pages:

| Page | What it shows |
| :--- | :--- |
| **Arena** | Stage progress, Now Playing per station (with the YouTube stream when set), Up Next, latest results, group race, most-picked characters, champion |
| **Groups** | Standings with Upper/Lower/Out, which tie-breaker separated players, head-to-head grid, fixtures, tie-breaker matches |
| **Playoffs** | 8-player double-elimination bracket (GSL crossover A↔B, C↔D) with Grand Final bracket reset |
| **Fighters** | Player cards and profiles: record, match history, characters, photo |
| **Rules** | English summary + the official Mongolian rules |
| **Admin** | Live scoring console, group draw, roster & photos, ties & seeds, streams, rehearsal, backup |

**Format (official rules):** 6 teams × 4 players (2 women, 2 men) = 24 players.
Groups A & B are women, C & D are men, one player per team in every group; BO3
round robin, win = 1 point. Ties: head-to-head (2 level) → game differential →
games won → BO1 tie-breaker → organizer decision. 1st → Upper Bracket, 2nd →
Lower Bracket. All playoff matches BO3, Grand Final BO5, reset if the
lower-bracket player wins it.

**Data:** the board is its own row in `public.tournaments`
(`VITE_TEKKEN_TOURNAMENT_ID`, default `ddam-cup-tekken-2026`), so Tekken scoring
never overwrites the other games. Every save is a compare-and-swap on
`state.rev`: when two admins save at once, the later change is re-applied on top
of the earlier one instead of replacing it. A save that fails (not signed in, not
an admin, offline) is undone on screen and reported.

**Admin:** the Tekken Admin page uses the same Supabase login and
`tournament_admins` list as the rest of the site.

**Player photos:** Admin → Roster → click a portrait → crop → save. Photos are
uploaded to the public Storage bucket `tekken-photos` (created by
`supabase/schema.sql`; admins write, everyone reads).

**Live stream:** Admin → Settings → Live Stream — paste a YouTube link per
station; it plays in Arena → Now Playing and never restarts on score updates.

**Checks:**

```bash
npm test          # Tekken engine: round robin, women/men draw, every tie-breaker path, bracket + reset
npm run typecheck # TypeScript check for src/tekken
```

Without Supabase env vars the Tekken board runs in LOCAL mode (no login,
data in this browser) — handy for trying it out. Admin → Settings →
**Simulate next step** walks a rehearsal board through the whole cup.

## CS2 tournament format

1. **Six teams** are entered with editable names, tags and five-player rosters.
2. All six teams play one **BO1** against every other team: **15 Group Stage
   matches** in total.
3. Group Stage results create **Seed 1–6**. Seed 1 and Seed 2 wait in the
   **Upper** slot.
4. Seed 3 vs Seed 6 and Seed 4 vs Seed 5 play two **Lower BO1 qualifiers**.
5. The two Lower winners join the two Upper seeds in two **BO3 semifinals**:
   Lower Qualifier 1 winner vs Seed 1, and Lower Qualifier 2 winner vs Seed 2.
6. The semifinal winners play the **Grand Final** for 1st/2nd; the semifinal
   losers play the **3rd Place Final** for 3rd/4th.
7. The four playoff results determine **1st–4th place**.

## Tie-break order

When two or more teams have the same points:

1. Head-to-head result.
2. Overall match win/loss record.
3. Game win/loss record.
4. Organizer-decided tie-break match, if required.

## Board actions

- **Export PNG** downloads the visible board as one image for sharing.
- **Copy Text** copies a plain-text ranking suitable for Discord, Messenger or chat.
- **Rules** opens the formatted tournament rules and progression summary.

## Features

- One launcher with DOTA 2 / CS2 / all additional game board selection and a
  rules hub.
- DOTA 2 branding with the original board layout and scoring.
- CS2 branding with a tactical HUD styling.
- Six editable seeded teams: Team Gegeenee, Team Ganaa, Team Garidaa, Team Amaraa,
  Team Bery and Team Bagaa.
- Five-player roster editing per team.
- Six-team Group Stage standings, Upper/Lower qualification and a four-match BO3
  playoff bracket.
- Supabase live sync with localStorage fallback.

## Run locally

Requirements: Node.js 18+ and npm.

```bash
npm install
npm run dev
```

The launcher opens at `http://localhost:5173`. Direct board pages are
`http://localhost:5173/dota2.html`, `http://localhost:5173/cs2.html` and
`http://localhost:5173/additional-games.html?game=mlbb` (change `game` to
`mecha`, `stumble`, `pubg`, `tekken` or `tetris`).

## Vercel deployment

Import the repository into Vercel. The project is already configured with
`vercel.json`; Vercel will run `npm run build` and publish `dist/`.
For shared live scores, add `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY` in Vercel Project Settings → Environment Variables,
then redeploy.

```bash
npm run build
npm run preview
```

## Supabase setup

1. Create a Supabase project.
2. Open **SQL Editor** and run [`supabase/schema.sql`](supabase/schema.sql). It is safe
   to re-run; it also creates the `tekken-photos` Storage bucket and its policies.
3. In **Authentication → Users**, create your one admin user with an email and password.
4. Copy that user's UUID, then run this in **SQL Editor**:

   ```sql
   insert into public.tournament_admins (user_id)
   values ('YOUR-AUTH-USER-UUID')
   on conflict (user_id) do nothing;
   ```

5. Disable public sign-ups in **Authentication → Settings** so nobody else can
   create an account. The leaderboard stays public, but only the listed user
   can write tournament state.
6. Copy `.env.example` to `.env` and fill in the project URL and publishable key
   from **Project Settings → API**.
7. For Vercel, add the same `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_PUBLISHABLE_KEY` variables to the project and redeploy.

The Admin tab requires Supabase Auth. Anonymous visitors can read the live
leaderboard, but RLS only permits users in `public.tournament_admins` to write.

## Main configuration

Tournament settings are in `src/config.js`:

```js
export const GROUP_MATCHES = 15;
export const LOWER_MATCHES = 2;
export const FINAL_MATCHES = 4;
export const NUM_TEAMS = 6;
export const SQUAD_SIZE = 5;
```

If the number of teams or roster size changes, use a new game-specific
`VITE_DOTA_TOURNAMENT_ID` or `VITE_CS2_TOURNAMENT_ID` so an old board shape
cannot be mixed into the new tournament.
