# daybook — Personal Progress Tracker

A private, responsive learning journal for recording DSA practice, concepts learned, features built, bugs fixed, projects, time spent, links, notes, and daily reflections. It is designed for personal use, not public showcasing.

## Features in this build

- Email/password registration and sign-in using Argon2id password hashes and HTTP-only session cookies.
- Personal default categories, custom categories, and reusable tags.
- Create, edit, delete, search, filter, and paginate activities.
- Record type, status, difficulty, date, time spent, notes, reference URL, category, and tags.
- Daily timeline and daily reflection saved in PostgreSQL.
- Whole-account analytics for total activity, time, completion, weekly trends, and category breakdown.
- Export the currently filtered activity set to CSV, compatible with Excel and Google Sheets.
- Responsive layout for laptop and phone screen sizes.

## Technology

- Web: React, Vite, TypeScript, Tailwind CSS 4, Lucide icons.
- API: Node.js, Fastify, TypeScript, Zod.
- Database: PostgreSQL, Drizzle ORM and Drizzle Kit.
- Monorepo: npm workspaces.

## Requirements

- Node.js 22 or newer and npm.
- Docker Engine and Docker Compose, or a PostgreSQL 16+ database.

## Run locally on Ubuntu/Linux

1. In the repository root, create your local environment file:

   ```bash
   cp .env.example .env
   ```

2. Create a secure local secret and put it in `.env` as `JWT_SECRET`:

   ```bash
   openssl rand -base64 48
   ```

   Replace the example value. Do not share or commit `.env`.

3. Start PostgreSQL:

   ```bash
   docker compose up -d postgres
   docker compose ps
   ```

4. Install packages from the root folder:

   ```bash
   npm install
   ```

5. Apply the database migrations:

   ```bash
   npm run db:migrate
   ```

6. Start the API and web app:

   ```bash
   npm run dev
   ```

7. Open `http://localhost:5173`. API health check: `http://localhost:4000/api/health`; database readiness: `http://localhost:4000/api/ready`.

If your PostgreSQL service is already running locally on port 5432, stop it or change the host port mapping in `docker-compose.yml` before starting the Docker database.

## Commands

- `npm run dev` — run web and API together.
- `npm run dev:web` — run only the web app.
- `npm run dev:api` — run only the API.
- `npm run typecheck` — TypeScript checks.
- `npm test` — API smoke tests.
- `npm run build` — production builds.
- `npm run db:generate` — generate a migration from schema changes.
- `npm run db:migrate` — apply migrations.

## Environment variables

Root `.env`:

- `NODE_ENV` — `development` locally, `production` in deployment.
- `PORT` — API port, default `4000`.
- `WEB_ORIGIN` — exact frontend origin, default `http://localhost:5173`.
- `DATABASE_URL` — PostgreSQL connection URL.
- `JWT_SECRET` — random secret of at least 32 characters.
- `COOKIE_NAME` — session cookie name, default `ppt_session`.

Optional `apps/web/.env`:

- `VITE_API_BASE_URL` — API base URL; defaults to `http://localhost:4000`.

## API overview

- `GET /api/health`, `GET /api/ready`, `GET /api/analytics`
- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- `GET/POST/PATCH/DELETE /api/categories`
- `GET/POST/PATCH/DELETE /api/tags`
- `GET/POST /api/activities`, `GET/PATCH/DELETE /api/activities/:id`
- `GET/PUT /api/daily-summary`

Activity list query parameters include `page`, `limit`, `categoryId`, `activityType`, `status`, `difficulty`, `startDate`, `endDate`, `tagId`, `search`, `sortBy`, and `sortDir`.

## Privacy and deployment

- The browser talks to the API; it never connects directly to PostgreSQL.
- Passwords are hashed. Auth cookies are HTTP-only and SameSite Strict; Secure is enabled in production.
- Private routes scope records to the authenticated account. Configure exact allowed origins.
- Do not expose PostgreSQL to the public internet. For laptop + phone access away from home, deploy the web app and API over HTTPS with a private managed database, configure the production origin and secrets, and test authorization before entering personal records.
- Use periodic database backups and CSV exports. CSV export is implemented; scheduled automated backups and password recovery are not.

## Notes

The UI is intentionally functional and focused on private record keeping. Analytics are global account totals; activity list filters and CSV exports operate on the currently selected filters. Daily summaries are stored per account and date. Before production use, run the type checks, tests, migration, and a manual end-to-end test on your machine.
