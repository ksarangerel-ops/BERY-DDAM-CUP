# DDAM CUP — DOTA 2 Tournament Board

Real-time DOTA 2 tournament scoreboard for six teams. The board uses a
black-and-red esports theme and syncs through Supabase Realtime.

## Tournament format

1. **Six teams** are entered with editable names, tags and five-player rosters.
2. Teams start in **Zone A** and **Zone B**, three teams per zone. The organiser
   can edit the assignment later from **Admin → Team Setup**.
3. Each zone plays a **BO2 round robin**: every team plays the other two teams
   once, for three matches per zone.
4. Match points are **2–0 = 3 points**, **1–1 = 1 point**, **0–2 = 0 points**.
5. The lowest-ranked team from each zone is eliminated. The top two from each
   zone qualify, creating a four-team final group.
6. The four finalists play a second **BO2 round robin**. Every finalist plays
   the other three once, for six final matches.
7. Final 1st, 2nd, 3rd and 4th place are determined by total points and the
   published tie-break order.

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

- DOTA 2 branding with black/red tournament styling.
- Six seeded teams: Team Gegeenee, Team Ganaa, Team Garidaa, Team Amaraa,
  Team Bery and Team Bagaa.
- Five-player roster editing per team.
- Editable A/B zone assignment with a three-team limit per zone.
- Zone standings, four-team final round-robin schedule and overall standings.
- Supabase live sync with localStorage fallback.

## Run locally

Requirements: Node.js 18+ and npm.

```bash
npm install
npm run dev
```

The board opens at `http://localhost:5173`.

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
3. Copy `.env.example` to `.env` and fill in the project URL and anon key from
   **Project Settings → API**.
4. For Vercel, add the same `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_PUBLISHABLE_KEY` variables to the project and redeploy.

The starter SQL allows anonymous read/write so the existing Admin screen works
without a login. That is suitable for a small internal cup; add Supabase Auth
and tighten the RLS policies before using it as a public production system.

## Main configuration

Tournament settings are in `src/config.js`:

```js
export const ZONES = ['A', 'B'];
export const TEAMS_PER_ZONE = 3;
export const ZONE_MATCHES = 3;
export const FINAL_MATCHES = 6;
export const QUALIFIERS_PER_ZONE = 2;
export const SQUAD_SIZE = 5;
```

If the number of teams or roster size changes, use a new `VITE_TOURNAMENT_ID`
so an old board shape cannot be mixed into the new tournament.
