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
- Learning Roadmap: structured organization by category and technology, topic tracking with statuses and rich notes, JSON roadmap importing with preview and diffing, and separate completion metrics.
- Responsive layout for laptop and phone screen sizes.

## Learning Roadmap

The **Learning Roadmap** helps you organize technology learning paths, track topic completion, maintain notes, and monitor progress across 12 software engineering domains.

### Structure & Hierarchy

The Learning Roadmap provides 12 primary roadmap categories containing 69 child technologies in the exact order:

1. **Programming Languages**
   - JavaScript, TypeScript
2. **Web Fundamentals**
   - HTML, CSS, Browser Basics, Web Architecture
3. **Frontend Development**
   - React, Redux Toolkit, Next.js, Tailwind CSS
4. **Backend Development**
   - Node.js, Express.js, Fastify
5. **API & Security**
   - REST APIs, Authentication, Authorization, JWT, OAuth, Webhooks, API Security
6. **Databases & Caching**
   - SQL, PostgreSQL, MongoDB, Mongoose, Redis, Indexing, Transactions
7. **Real-Time & Messaging**
   - WebSockets, Socket.IO, WebRTC, STUN/TURN, BullMQ, RabbitMQ, Kafka
8. **Computer Science & DSA**
   - DSA, OOP, DBMS, Operating Systems, Computer Networks
9. **System Design & Architecture**
   - HLD, LLD, Monolith, Microservices, Caching Strategies, Load Balancing, Distributed Systems
10. **Testing & Performance**
    - Unit Testing, Integration Testing, Vitest/Jest, Supertest, k6, Autocannon
11. **DevOps, Cloud & Observability**
    - Git, GitHub, Linux, Bash, Docker, CI/CD, AWS Basics, Nginx, Prometheus, Grafana, OpenTelemetry
12. **Projects & Interview Preparation**
    - Projects, Resume, Project Deep Dives, Coding Interviews, System Design Interviews, HR/Behavioral Questions

- **Zero sample topics by default**: All 69 technology lists initialize completely empty (`"No topics added yet. Import a JSON roadmap to get started."`). No sample or dummy topics are pre-populated.
- **Accurate Progress Calculations**: Progress is computed dynamically strictly from saved topic records:
  - Technology progress = `(Completed topics / Total topics) * 100` (or `0%` when 0 topics)
  - Roadmap progress = `(Completed topics in roadmap / Total topics in roadmap) * 100` (or `0%` when 0 topics)
  - Overall progress = `(All completed topics / All topics) * 100` (or `0%` when 0 topics)
- **Three-Tier Navigation**:
  - **Level 1 (Overview)**: 12 responsive roadmap cards (3-col desktop, 2-col tablet, 1-col mobile), high-level metrics, and real-time search.
  - **Level 2 (Roadmap Detail)**: Breadcrumb navigation, category description, child technology grid with topic counts and progress, search filtering.
  - **Level 3 (Technology Detail)**: Breadcrumb navigation, topic listing, status filters (`Not Started`, `In Progress`, `Completed`, `Needs Revision`), quick toggle, notes panel, and JSON import modal.
- **Hash-based URL routing**: Supports browser refresh and direct linking via `#roadmap`, `#roadmap/:categoryId`, and `#roadmap/:categoryId/:technologyId`.

### Setup, Database Migrations & Seeding

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure Environment**:
   Ensure `.env` in the root (or `apps/api/.env`) contains `DATABASE_URL` pointing to PostgreSQL:
   ```env
   DATABASE_URL=postgresql://user:password@host/database?sslmode=require
   SESSION_SECRET=your-secure-session-secret-at-least-32-chars
   CORS_ORIGIN=http://localhost:5173
   PORT=4000
   ```

3. **Apply Database Migrations**:
   Roadmap schema tables (`roadmap_categories`, `roadmap_technologies`, `roadmap_topics`) are managed via Drizzle:
   ```bash
   npm run db:migrate -w @ppt/api
   ```

4. **Seed 12 Roadmaps & 69 Technologies (Idempotent)**:
   You can run the dedicated seeding script:
   ```bash
   npx tsx apps/api/src/scripts/seed.ts
   ```
   *Note: Seeding is also run automatically and idempotently whenever a user accesses the Roadmap overview or initializes via `POST /api/roadmap/initialize`.*
   - Existing user progress and custom topics/notes are 100% preserved.
   - Topics remain empty (0 topics) until you import them.

5. **Start Application**:
   ```bash
   npm run dev
   ```
   - API: `http://localhost:4000`
   - Web: `http://localhost:5173`

### JSON Import Feature

The application includes a robust, validated JSON import system with preview, diff calculation, duplicate detection, and atomic transaction execution.

#### Supported JSON Hierarchy Formats

##### 1. Full Multi-Category Hierarchy Format:
```json
{
  "version": 1,
  "categories": [
    {
      "name": "Programming Languages",
      "technologies": [
        {
          "name": "JavaScript",
          "topics": [
            {
              "title": "Closures & Lexical Scope",
              "description": "Understanding lexical environment, function scopes, and closure memory.",
              "order": 1,
              "status": "In Progress",
              "notes": {
                "short": "Functions bundled with outer lexical environment",
                "detailed": "A closure is created when an inner function references variables from outer scope.",
                "referenceUrl": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Closures"
              }
            },
            {
              "title": "Event Loop & Microtask Queue",
              "description": "Call stack, Macrotasks, Microtasks (Promises), and rendering pipeline.",
              "order": 2,
              "status": "Completed"
            }
          ]
        }
      ]
    }
  ]
}
```

##### 2. Single Technology Topics Format (when importing inside a technology):
```json
{
  "topics": [
    {
      "title": "DOM Manipulation",
      "description": "Query selectors, mutation observers, events.",
      "order": 1
    },
    {
      "title": "Async/Await & Promises",
      "order": 2
    }
  ]
}
```
*(Or simply a bare array of topic objects `[ { "title": "Topic Name", ... } ]`)*

#### Topic Field Reference

| Field | Type | Description |
|---|---|---|
| `title` | string (required) | Topic title (max 200 characters) |
| `description`| string | Optional topic overview |
| `status` | string | `'Not Started'`, `'In Progress'`, `'Completed'`, or `'Needs Revision'` (default: `'Not Started'`) |
| `order` | integer | Explicit ordering priority (preserved from JSON) |
| `notes.short` | string | Quick summary note |
| `notes.detailed` | string | In-depth notes |
| `notes.code` | string | Code example or snippet |
| `notes.referenceUrl` | string | External URL reference |

#### Import Modes & Safety Guarantees

- **Add New (Default)**: Adds new topics found in the JSON file. Existing topics with the same title are left intact, preserving your completion status and notes.
- **Update Existing**: Updates matched topics with new description and notes from the JSON file. Includes an explicit confirmation checkbox if you wish to overwrite existing notes or completion statuses.
- **No Deletion Guarantee**: Unmentioned topics in the JSON are **never deleted**.
- **Atomic Database Transactions**: All topics within an import batch are committed within a single database transaction. If any error occurs, all changes roll back safely.

## API overview

- `GET /api/health`, `GET /api/ready`, `GET /api/analytics`
- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- `GET/POST/PATCH/DELETE /api/categories`
- `GET/POST/PATCH/DELETE /api/tags`
- `GET/POST /api/activities`, `GET/PATCH/DELETE /api/activities/:id`
- `GET/PUT /api/daily-summary`
- **Roadmap APIs**:
  - `GET /api/roadmap/overview` — full categories, technologies, and progress metrics
  - `GET /api/roadmap/summary` — high-level progress statistics
  - `POST /api/roadmap/initialize` — idempotent setup of default categories & technologies
  - `GET/POST /api/roadmap/categories`, `PATCH/DELETE /api/roadmap/categories/:id`
  - `GET/POST /api/roadmap/technologies`, `GET/PATCH/DELETE /api/roadmap/technologies/:id`, `POST /api/roadmap/technologies/reorder`
  - `GET/POST /api/roadmap/technologies/:id/topics`, `GET/PATCH/DELETE /api/roadmap/topics/:id`, `PATCH /api/roadmap/topics/:id/toggle`, `POST /api/roadmap/topics/reorder`
  - `POST /api/roadmap/import/preview` — dry-run parse, validation, diff calculation
  - `POST /api/roadmap/import/commit` — transactional import execution

Activity list query parameters include `page`, `limit`, `categoryId`, `activityType`, `status`, `difficulty`, `startDate`, `endDate`, `tagId`, `search`, `sortBy`, and `sortDir`.

## Privacy and deployment

- The browser talks to the API; it never connects directly to PostgreSQL.
- Passwords are hashed. Auth cookies are HTTP-only and SameSite Strict; Secure is enabled in production.
- Private routes scope records to the authenticated account. Configure exact allowed origins.
- Do not expose PostgreSQL to the public internet. For laptop + phone access away from home, deploy the web app and API over HTTPS with a private managed database, configure the production origin and secrets, and test authorization before entering personal records.
- Use periodic database backups and CSV exports. CSV export is implemented; scheduled automated backups and password recovery are not.

## Notes

The UI is intentionally functional and focused on private record keeping. Analytics are global account totals; activity list filters and CSV exports operate on the currently selected filters. Daily summaries are stored per account and date. Before production use, run the type checks, tests, migration, and a manual end-to-end test on your machine.
