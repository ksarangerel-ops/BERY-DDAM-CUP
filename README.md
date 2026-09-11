# DDAM CUP — CS2 Tournament Board

Real-time CS2 tournament scoreboard for six teams. The board uses a
black-and-red esports theme and syncs through Supabase Realtime.

## Tournament format

1. **Six teams** are entered with editable names, tags and five-player rosters.
2. All six teams play one **BO1** against every other team: **15 Group Stage
   matches** in total.
3. Group Stage results create **Seed 1–6**. Seed 1 and Seed 2 wait in the
   **Upper** slot.
4. Seed 3 vs Seed 6 and Seed 4 vs Seed 5 play two **Lower BO1 qualifiers**.
5. The two Lower winners join the two Upper seeds, creating the **Final Four**.
6. The Final Four play a **BO3 round robin**: every finalist plays the other
   three finalists once, for six matches total.
7. Final Four results determine **1st–4th place**.

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

- CS2 branding with a tactical purple/cyan esports styling.
- Six editable seeded teams: Team Alpha, Team Bravo, Team Charlie, Team Delta,
  Team Echo and Team Foxtrot.
- Five-player roster editing per team.
- Six-team Group Stage standings, Upper/Lower qualification and Final Four BO3
  round robin.
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
export const FINAL_MATCHES = 6;
export const NUM_TEAMS = 6;
export const SQUAD_SIZE = 5;
```

If the number of teams or roster size changes, use a new `VITE_TOURNAMENT_ID`
so an old board shape cannot be mixed into the new tournament.
