# Campus Hiring Tracker

Live tracker for the campus hiring process: hiring targets, drive calendar, panel
allocation, candidate lists, OA score import, real-time interview scoring, round table,
and final results reporting.

## Setup

1. Create a Postgres database (e.g. a new Supabase project).
2. In that same Supabase project, create a **private** Storage bucket named
   `candidate-documents` (candidate CVs and assessment reports are stored there).
3. Copy `server/.env.example` to `server/.env` and fill in `DATABASE_URL` / `DIRECT_URL`,
   `JWT_SECRET` (any random string), and `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`
   (Project Settings — see comments in `.env.example` for exactly where to find each).
4. Copy `client/.env.example` to `client/.env` if you need to point at a non-default
   server URL.
5. Install deps: `npm install` (installs both workspaces).
6. Run migrations + seed: `npm run prisma:migrate` then `npm run seed`.
7. Start both apps: `npm run dev` (server on :4000, client on :5173).

The seed script creates one super-admin login — check the server console output for the
generated password on first run.
