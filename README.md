# DDAM CUP — DOTA 2 Tournament Board

Real-time DOTA 2 tournament scoreboard for six teams. The board uses a
black-and-red esports theme and can run locally or sync through Firebase.

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
- Firebase live sync with localStorage fallback.

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
For shared live scores, add the `VITE_FIREBASE_*` variables from `.env` in
Vercel Project Settings → Environment Variables, then redeploy.

```bash
npm run build
npm run preview
```

## Firebase

Copy `.env.example` to `.env` and fill in the Firebase Realtime Database values.
The default board id is `ddam-cup-dota2-ab-roundrobin`; set
`VITE_TOURNAMENT_ID` to use a different board. The Firebase rules are in
`database.rules.json`.

The browser-visible Firebase API key is not an authorisation secret. Database
Rules are the actual access control. The included rules are suitable for an
internal board and allow public read/write, so use authenticated rules if the
board is public.

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
