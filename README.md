# DDAM CUP — DOTA 2 & CS2 Tournament Hub

One Vercel website with separate real-time DOTA 2, CS2 and additional game
tournament boards. The launcher is at `/`; the dedicated boards are
`/dota2.html`, `/cs2.html` and `/additional-games.html`. The additional board
contains live scorecards for Mobile Legends, Meccha Chameleon, Stumble Guys,
PUBG Mobile and Tekken 8. Rules are summarized at `/games.html`, with the full
Mobile Legends rules at `/mobile-legends.html`.

## Tournament boards

- **DOTA 2:** two editable zones with BO2 round-robin matches followed by the
  existing BO3 playoff bracket.
- **CS2:** six-team Group BO1 round robin (15 matches), two Lower BO1 qualifiers,
  then two BO3 semifinals, a Grand Final and a 3rd Place Final (4 matches) for places 1–4.
- **Additional live boards:** one public realtime page with tabs for Mobile
  Legends, Meccha Chameleon, Stumble Guys, PUBG Mobile and Tekken 8. Admins can
  edit team names, series results, player points and map scores from the page.
- **Mobile Legends:** six teams split into two BO2 groups, then A1 vs B2 and
  B1 vs A2 BO3 semifinals, Grand Final and 3rd Place Final.

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
- Six editable seeded teams: Team Alpha, Team Bravo, Team Charlie, Team Delta,
  Team Echo and Team Foxtrot.
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
`mecha`, `stumble`, `pubg` or `tekken`).

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
2. Open **SQL Editor** and run [`supabase/schema.sql`](supabase/schema.sql).
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
