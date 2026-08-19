# Campus Hiring Tracker

Live tracker for the campus hiring process: hiring targets, drive calendar, panel
allocation, candidate lists, OA score import, real-time interview scoring, round table,
and final results reporting.

## Setup

1. Create a Postgres database (e.g. a new Supabase project).
2. Copy `server/.env.example` to `server/.env` and fill in `DATABASE_URL` / `DIRECT_URL`
   (and `JWT_SECRET` — any random string).
3. Copy `client/.env.example` to `client/.env` if you need to point at a non-default
   server URL.
4. Install deps: `npm install` (installs both workspaces).
5. Run migrations + seed: `npm run prisma:migrate` then `npm run seed`.
6. Start both apps: `npm run dev` (server on :4000, client on :5173).

The seed script creates one super-admin login — check the server console output for the
generated password on first run.
