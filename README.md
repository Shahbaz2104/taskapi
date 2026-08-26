# 📝 Task Management API

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat&logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?style=flat&logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-47A248?style=flat&logo=mongodb&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue.svg)
![CI](https://img.shields.io/badge/CI-passing-brightgreen)

A production-grade **RESTful Task Management API** built with **TypeScript (native ESM)** on **Node.js + Express 5**, **MongoDB (Mongoose)**, and **Redis**. Users register, log in with **JWT access + rotating refresh tokens** (optionally hardened with **TOTP two-factor auth and recovery codes**), and manage tasks with priorities, due dates, tags, search, recurrence, **soft-delete trash**, **bulk operations**, **CSV/JSON import**, an **iCal calendar feed**, **webhooks**, and **task sharing with comments and an activity trail**. Includes RBAC, email verification, password reset, due-date reminders, rate limiting, idempotency, **PostHog product analytics**, and **Sentry error tracking** — fully covered by **184 Vitest integration & unit tests**.

---

## 🚀 Features

### Core

- 🔐 **Full auth lifecycle** — register (email verification), login, refresh-token rotation with theft detection, logout, forgot/reset password
- 🔢 **Two-factor authentication** — TOTP enrollment (`otplib`) with QR code, purpose-scoped challenge tokens for the login handshake, and 8 single-use hashed recovery codes
- 💻 **Session/device management** — every login records IP + user agent; list active sessions and revoke any of them individually
- 📋 **Rich task domain** — `priority`, `dueDate`, `tags`, `in_progress` status, `recurrence` (daily/weekly/monthly)
- 🔎 **Search & sort** — full-text search, sort by createdAt/updatedAt/dueDate/priority rank
- 📊 **Stats endpoint** — counts by status/priority, overdue, completion rate (Redis-cached 60s, invalidated on mutations)

### Task power features

- 🗑️ **Soft-delete trash** — deletes land in a restorable trash; a daily BullMQ job purges entries after a retention window (`TRASH_RETENTION_DAYS`, default 30)
- ⚡ **Bulk operations** — complete / trash / restore / purge / set priority across up to 100 tasks in one call
- 📥 **Import** — JSON array or raw CSV (RFC 4180 parser), ≤500 rows per request, per-row partial success `{ imported, failed[] }`, replayable via `Idempotency-Key`
- 📤 **CSV export** — download your live tasks
- 📅 **iCal feed** — subscribe from any calendar app via `/tasks/calendar.ics?token=…`; regenerable per-user feed token, RFC 5545 escaping/folding
- 🔁 **Recurring tasks** — completing one spawns the next occurrence (race-safe: guarded inside the update filter)

### Collaboration & integrations

- 👥 **Task sharing** — grant `viewer` / `editor` roles by username; non-members are indistinguishable from nonexistent tasks (404); editors can update and comment, viewers read; append-only activity trail; `GET /me/shared` inbox
- 💬 **Comments** — threaded discussion on shared tasks with zod-validated payloads
- 🪝 **Webhooks** — register endpoints, pick events (`task.created/completed/trashed`), receive signed deliveries (`X-TaskAPI-Signature` = HMAC-SHA256 over `timestamp.body`, 5s timeout, exponential retries, auto-disable after 10 consecutive failures, test ping)

### Platform

- 🛡️ **Security** — helmet, CORS, Redis-backed rate limiting (global + login/register/forgot/reset/2FA challenge), bcrypt, refresh-token reuse detection, generic 5xx responses
- 🧾 **Idempotency** — `Idempotency-Key` header dedupes retries on `POST /tasks` and task imports (Mongo-backed, TTL 24h)
- 📈 **Analytics & errors** — PostHog product events through a soft-fail seam; Sentry captures route errors + queue failures without DSN-configured noise in dev
- 📖 **OpenAPI-served API** — Swagger UI at `/api-docs` (endpoint annotations being re-added after the TS migration — see Known gaps)
- 🧪 **Testing** — 184 tests (integration + unit) on **Vitest**, coverage thresholds enforced in CI
- 🐳 **Dockerized** — `docker compose up` runs app + MongoDB + Redis with healthchecks
- 🚦 **CI pipeline** — GitHub Actions: typecheck + lint + format + tests-with-coverage + build on Node 20 & 22

---

## 🏗 System Design

```
                    ┌────────────────────────────────────────────┐
                    │            Load balancer / proxy           │
                    │          (Render / Railway / nginx)        │
                    └──────────────────────┬─────────────────────┘
                                           │
                    ┌──────────────────────▼─────────────────────┐
                    │          Express app (N stateless           │
                    │          replicas, all under /api/v1)       │
                    │  routes → controllers → services → models  │
                    │  + JWT verify + RBAC + validation + pino   │
                    │  + Sentry request/error handlers           │
                    └───────┬──────────────────────┬─────────────┘
                            │                      │
              ┌─────────────▼──────────┐  ┌────────▼──────────────┐
              │  MongoDB (Atlas/local) │  │  Redis 7              │
              │  users, tasks, tokens, │  │  • rate-limit store   │
              │  shares, comments,     │  │  • stats cache (60s)  │
              │  webhooks, activity,   │  │  • BullMQ broker      │
              │  idempotency records   │  │                       │
              └────────────────────────┘  └───────┬───────────────┘
                                                  │
                                     ┌────────────▼──────────────┐
                                     │ BullMQ workers            │
                                     │ • email worker (SMTP)     │
                                     │ • reminder job (hourly)   │
                                     │ • trash cleanup (daily)   │
                                     │ • webhook deliveries      │
                                     └───────────────────────────┘
```

**Key design decisions**

- **Stateless replicas** — access tokens are self-validating JWTs, so any instance can serve any request; no sticky sessions.
- **Redis-backed rate limiting** — limits are shared across replicas; if Redis is down the app **fails soft** back to memory stores. Every optional integration (Redis, PostHog, Sentry, email) follows the same soft-fail rule: missing config or outage degrades gracefully instead of breaking requests.
- **Refresh tokens in MongoDB, not Redis** — rotated on every use, revoked on logout/password change/2FA changes, stored hashed (sha256), with theft detection (a revoked token being presented again revokes _all_ sessions).
- **2FA challenge tokens are purpose-scoped** — a separate short-lived JWT claim means an auth challenge can never be replayed as an API access token (and vice versa).
- **Access chokepoint for collaboration** — every shared-task route resolves permissions through `loadTaskWithAccess` (owner > editor > viewer). A failed lookup collapses to 404 so outsiders learn nothing about task existence.
- **Async work via BullMQ** — emails, reminders, trash purges and webhook deliveries are enqueued and processed by workers; the request path never blocks. Webhook enqueueing is best-effort: a queue outage never fails the product action that triggered it.
- **Service layer** — controllers stay thin (HTTP concerns only); business logic lives in `src/services/` and is unit-testable. All request validation is **zod** (`src/schemas/`) — the single source of truth.
- **Idempotent writes** — a unique `(user, key)` index reserves the response _before_ the mutation happens, so retries return the original result.
- **Not over-engineered** — monolith-first with Redis/queue as the first extractable pieces when a real scaling driver appears.

## 📁 Folder Structure

```
taskapi/
 ├─ src/
 │   ├─ app.ts                  # Pure Express construction (routes/middleware/metrics/docs)
 │   ├─ server.ts               # Boot: env fail-fast → DB → Redis → listen + workers + graceful shutdown
 │   ├─ config/
 │   │   ├─ env.ts              # Zod-validated env (single source of truth for all 20 keys)
 │   │   ├─ constants.ts        # Typed enums/queues/TTLs (+ exported unions)
 │   │   ├─ db.ts  redis.ts     # Mongo connection · soft-fail Redis client
 │   │   ├─ logger.ts           # pino (silent under test)
 │   │   ├─ rate_limit.ts       # Redis-backed limiter factory (memory fallback)
 │   │   ├─ sentry.ts  posthog.ts  # Soft-fail observability seams
 │   │   └─ swagger.ts          # OpenAPI spec served at /api-docs
 │   ├─ models/                 # Mongoose schemas w/ InferSchemaType typing
 │   │   └─ task/user/token/webhook/idempotency/activity/comment/taskShare.ts
 │   ├─ schemas/                # Zod request schemas — mirror of the old validator chains
 │   │   └─ auth/account/admin/tasks/bulk/sharing/webhooks/params.ts
 │   ├─ middleware/
 │   │   ├─ auth.ts             # protect (Bearer JWT) + currentUser guard
 │   │   ├─ rbac.ts             # authorize(...roles)
 │   │   ├─ zod.ts              # zodValidate(schema, source)
 │   │   └─ error_handler.ts    # pino-logged central handler (generic 5xx)
 │   ├─ services/               # Business logic — auth/tasks/collab/webhooks/email/analytics
 │   ├─ jobs/                   # BullMQ workers: email/reminders/trash-cleanup/webhooks
 │   ├─ controllers/            # Thin HTTP handlers (auth/tasks/user/collab/webhooks/admin)
 │   ├─ routes/                 # auth/tasks/user/admin routers under /api/v1
 │   ├─ dto/                    # PublicUser serializer (secret-leak-proof by construction)
 │   ├─ errors/                 # AppError hierarchy (400→502) + isAppError guard
 │   └─ types/                  # JWT payload union, RequestUser, global req.user
 ├─ tests/
 │   ├─ vitest.setup.ts         # Env seeded BEFORE module imports
 │   ├─ unit/                   # env · errors · dto · middleware · pure service logic
 │   └─ integration/            # Full-app suites: boot/sessions/auth/tasks/trash/
 │                              # collab/webhooks/twofa/import-iCal/observability
 ├─ scripts/boot-check.mjs      # Boots compiled dist vs memory-mongo and smoke-tests it
 ├─ tsconfig.json / tsconfig.build.json
 ├─ vitest.config.mts           # Node env · coverage thresholds 80/60/70/82
 ├─ Dockerfile                  # Multi-stage: build (tsc) → prod deps → slim runner
 └─ docker-compose.yml          # App + MongoDB + Redis with healthchecks
```

---

## ⚡ Getting Started

### Prerequisites

- **Node.js 20.19+** (required by Mongoose 9)
- MongoDB instance (local or Atlas) — **Redis optional** (falls back gracefully)

### Installation

```bash
git clone <repo-url>
cd taskapi
npm install
```

### Scripts

| Command                 | What it does                                      |
| ----------------------- | ------------------------------------------------- |
| `npm run dev`           | Dev server with watch (`tsx watch src/server.ts`) |
| `npm run build`         | Compile to `dist/` (`tsc -p tsconfig.build.json`) |
| `npm start`             | Run compiled output (`node dist/server.js`)       |
| `npm test`              | Full Vitest suite                                 |
| `npm run test:coverage` | Suite + v8 coverage report                        |
| `npm run typecheck`     | Strict `tsc --noEmit`                             |
| `npm run lint`          | ESLint (typescript-eslint strict)                 |

### Configuration

```bash
cp .env.example .env
```

| Variable                    | Required | Description                                             | Default                            |
| --------------------------- | -------- | ------------------------------------------------------- | ---------------------------------- |
| `PORT`                      | ❌       | Server port                                             | `3000`                             |
| `MONGO_URI`                 | ✅       | MongoDB connection string                               | —                                  |
| `JWT_SECRET`                | ✅       | Secret used to sign JWTs (keep long & random)           | —                                  |
| `REDIS_URL`                 | ❌       | Redis connection (rate limits, cache, queues, webhooks) | none                               |
| `CLIENT_BASE_URL`           | ❌       | Base URL for emailed links & the iCal feed URL          | request origin                     |
| `ACCESS_TOKEN_TTL`          | ❌       | Access token lifetime (seconds)                         | `900`                              |
| `REFRESH_TOKEN_TTL`         | ❌       | Refresh token lifetime (seconds)                        | `604800`                           |
| `CORS_ORIGIN`               | ❌       | Allowed CORS origin                                     | `*`                                |
| `TRASH_RETENTION_DAYS`      | ❌       | Days before trashed tasks are purged                    | `30`                               |
| `POSTHOG_API_KEY`           | ❌       | PostHog project API key (product analytics)             | none                               |
| `POSTHOG_HOST`              | ❌       | PostHog ingest host                                     | `https://us.i.posthog.com`         |
| `SENTRY_DSN`                | ❌       | Sentry DSN (error tracking; inert without it)           | none                               |
| `SENTRY_TRACES_SAMPLE_RATE` | ❌       | Sentry performance sampling                             | `0.1`                              |
| `SMTP_HOST`                 | ❌       | SMTP server (without it, emails are logged, not sent)   | none                               |
| `SMTP_PORT`                 | ❌       | SMTP port (`465` = TLS)                                 | `587`                              |
| `SMTP_USER`                 | ❌       | SMTP username                                           | —                                  |
| `SMTP_PASS`                 | ❌       | SMTP password                                           | —                                  |
| `SMTP_FROM`                 | ❌       | From address for emails                                 | `TaskAPI <no-reply@taskapi.local>` |

The server fails fast at startup if `MONGO_URI` or `JWT_SECRET` are missing.

## 🔐 Authentication

```
POST /auth/register  ──►  { accessToken, refreshToken }   (+ verification email)
POST /auth/login     ──►  { accessToken, refreshToken }  (or { requires2FA, challengeToken })
POST /auth/2fa/challenge ──►  { accessToken, refreshToken }  (TOTP or recovery code)
POST /auth/refresh   ──►  rotates the refresh token, returns a new pair
POST /auth/logout    ──►  revokes the refresh token
```

1. Send `Authorization: Bearer <accessToken>` on every protected request
2. When the access token expires (15m), call `/auth/refresh` with the refresh token (7d)
3. Refresh tokens are **rotated** on every use — a reused token revokes all sessions (theft detection)
4. With 2FA enabled, login returns a **purpose-scoped challenge token** (5 min) instead of tokens; exchange it plus a TOTP/recovery code at `/auth/2fa/challenge`

> Usernames 3–30 chars; passwords 6–72 chars; email verified via emailed link.
> Login/register are rate-limited to **10 / 15 min** per IP; forgot-password and the 2FA challenge to **5 / 15 min**.

---

## 📌 API Endpoints

All endpoints live under **`/api/v1`**.

### Auth (public)

| Method | Endpoint                | Description                                   |
| ------ | ----------------------- | --------------------------------------------- |
| POST   | `/auth/register`        | Create account, returns token pair            |
| POST   | `/auth/login`           | Log in, returns token pair (or 2FA challenge) |
| POST   | `/auth/2fa/challenge`   | Complete 2FA login with TOTP or recovery code |
| POST   | `/auth/refresh`         | Rotate a refresh token                        |
| POST   | `/auth/logout`          | Revoke a refresh token                        |
| POST   | `/auth/verify-email`    | Verify email with emailed token               |
| POST   | `/auth/forgot-password` | Request a reset link                          |
| POST   | `/auth/reset-password`  | Set new password with token                   |

### Tasks (protected)

| Method | Endpoint              | Description                                                                      |
| ------ | --------------------- | -------------------------------------------------------------------------------- |
| GET    | `/tasks`              | List your tasks (paginated, filtered, searched, sorted)                          |
| GET    | `/tasks/stats`        | Aggregated stats (by status/priority, overdue, completion rate)                  |
| GET    | `/tasks/export`       | Download your live tasks as CSV                                                  |
| POST   | `/tasks/import`       | Import JSON array or raw CSV (`{ imported, failed[] }`, `Idempotency-Key` aware) |
| GET    | `/tasks/trash`        | List trashed tasks                                                               |
| DELETE | `/tasks/trash`        | Empty the trash permanently                                                      |
| PATCH  | `/tasks/bulk`         | Bulk complete / trash / restore / purge / set priority (≤100 ids)                |
| GET    | `/tasks/calendar.ics` | Public iCal feed (token-authenticated — no JWT)                                  |
| GET    | `/tasks/:id`          | Get one of your tasks (or one shared with you)                                   |
| POST   | `/tasks`              | Create a task (idempotent via `Idempotency-Key`)                                 |
| PUT    | `/tasks/:id`          | Update a task (owner or editor role)                                             |
| DELETE | `/tasks/:id`          | Soft-delete into trash (owner only)                                              |
| GET    | `/tasks/all`          | **Admin only** — paginated list of every task                                    |

### Collaboration (task members)

| Method | Endpoint                     | Description                                    |
| ------ | ---------------------------- | ---------------------------------------------- |
| POST   | `/tasks/:id/shares`          | Grant viewer/editor access by username (owner) |
| GET    | `/tasks/:id/shares`          | List collaborators (owner)                     |
| DELETE | `/tasks/:id/shares/:shareId` | Revoke a share (owner)                         |
| GET    | `/tasks/:id/comments`        | List comments (any member)                     |
| POST   | `/tasks/:id/comments`        | Add a comment (editor+)                        |
| GET    | `/tasks/:id/activity`        | Activity trail (any member)                    |

### Account (protected)

| Method | Endpoint                   | Description                                |
| ------ | -------------------------- | ------------------------------------------ |
| GET    | `/me`                      | Get your profile                           |
| PATCH  | `/me`                      | Update username/email                      |
| PUT    | `/me/password`             | Change password (revokes all sessions)     |
| GET    | `/me/sessions`             | Active sessions/devices (IP + user agent)  |
| DELETE | `/me/sessions/:sessionId`  | Revoke one session                         |
| POST   | `/me/2fa/setup`            | Get TOTP secret + QR code                  |
| POST   | `/me/2fa/enable`           | Verify code → recovery codes shown once    |
| POST   | `/me/2fa/disable`          | Disable with password + code               |
| GET    | `/me/calendar-feed`        | iCal feed URL (token provisioned lazily)   |
| POST   | `/me/calendar-feed/rotate` | Regenerate the feed token (old URL dies)   |
| GET    | `/me/webhooks`             | List webhook endpoints                     |
| POST   | `/me/webhooks`             | Register endpoint + event subscriptions    |
| PATCH  | `/me/webhooks/:id`         | Update URL/subscriptions/active flag       |
| DELETE | `/me/webhooks/:id`         | Delete endpoint                            |
| POST   | `/me/webhooks/:id/ping`    | Send a signed test delivery                |
| GET    | `/me/shared`               | Tasks others shared with you (+ your role) |
| DELETE | `/me`                      | Delete account + all data                  |

### Admin (admin only)

| Method | Endpoint           | Description                                |
| ------ | ------------------ | ------------------------------------------ |
| GET    | `/admin/users`     | Paginated user list (search + role filter) |
| PATCH  | `/admin/users/:id` | Change a user's role (not yourself)        |
| DELETE | `/admin/users/:id` | Delete a user + their data (not yourself)  |

### Other

| Method | Endpoint    | Description                         |
| ------ | ----------- | ----------------------------------- |
| GET    | `/health`   | Liveness probe                      |
| GET    | `/ready`    | Readiness probe (checks DB + Redis) |
| GET    | `/metrics`  | Prometheus metrics                  |
| GET    | `/api-docs` | Interactive Swagger UI docs         |

### Query params on `GET /tasks`

| Param    | Type   | Description                                                              | Default      |
| -------- | ------ | ------------------------------------------------------------------------ | ------------ |
| `page`   | number | Page number (1-based)                                                    | `1`          |
| `limit`  | number | Results per page (max 100)                                               | `10`         |
| `status` | string | `pending` / `in_progress` / `completed`                                  | none         |
| `search` | string | Full-text search across title & description                              | none         |
| `sort`   | string | `createdAt` / `updatedAt` / `dueDate` / `priority` (prefix `-` for desc) | `-createdAt` |

Example: `GET /tasks?page=2&limit=5&status=completed&sort=-priority`

> Note: pagination uses skip/limit — fine for personal scale; for deep pages a
> keyset/cursor pagination would be the next step (see System Design section).

---

## 🪝 Webhook deliveries

Signed POSTs hit your endpoint with:

```
Content-Type: application/json
X-TaskAPI-Event: task.completed
X-TaskAPI-Timestamp: 1730000000000
X-TaskAPI-Signature: sha256=<hmac_sha256(secret, "{timestamp}.{rawBody}")>
```

Verify by recomputing the HMAC over `${header.timestamp}.${rawBody}` with your endpoint's secret and comparing (constant-time compare recommended). Failed deliveries retry up to 5× with exponential backoff; after **10 consecutive failures** the endpoint is auto-disabled until you re-arm it.

---

## 🧪 Running Tests

```bash
npm test               # 184 tests: full-app integration + unit suites
npm run test:coverage  # same suite with v8 coverage report
node scripts/boot-check.mjs  # boots compiled dist against an in-memory Mongo and smoke-tests it
```

Coverage thresholds are enforced (statements ≥80%, branches ≥60%, functions ≥70%, lines ≥82%) — CI fails if coverage drops.

---

## 🛠 Technologies Used

- **Node.js 20.19+ / Express 5** — Runtime & web framework
- **MongoDB + Mongoose 9** — Database & ODM (compound + text indexes, aggregations)
- **Redis + BullMQ** — Shared rate limiting, stats cache, email queue, reminder cron, trash purge, webhook deliveries
- **jsonwebtoken + bcryptjs** — JWT access tokens, hashed refresh tokens, password hashing
- **otplib + qrcode** — TOTP two-factor auth with authenticator QR provisioning
- **zod** — request/response validation across every route (`src/schemas/`)
- **@sentry/node** — error tracking with Express integration (soft-fail)
- **posthog-node** — product analytics through a swallow-all capture seam
- **helmet / cors / compression / express-rate-limit / rate-limit-redis** — Security & performance
- **pino + pino-http + prom-client** — Structured logging, request IDs, metrics
- **nodemailer** — Email delivery (SMTP)
- **swagger-jsdoc + swagger-ui-express** — OpenAPI docs
- **TypeScript 6 (strict, native ESM) + tsx** — Type-safe runtime & dev server
- **Vitest + Supertest + mongodb-memory-server** — Testing

---

## ☁️ Deployment

The API is Docker-ready and deploys as-is to **Render**, **Railway**, or **Fly.io**:

1. Create a **MongoDB Atlas** cluster and a **Redis** instance (or use the compose one)
2. Set env vars: `MONGO_URI`, `JWT_SECRET`, `REDIS_URL`, `SMTP_*` (for emails), `CORS_ORIGIN`, optionally `SENTRY_DSN` / `POSTHOG_API_KEY`
3. Build `npm ci`, start `npm start` — the `/ready` probe drives health checks

When you have a live URL, paste it into the `servers` array in `src/config/swagger.ts`
and swap the static CI badge for a live one from GitHub's actions page.

---

## 📝 Resume / Portfolio Description

> Built a production-grade RESTful Task Management API (TypeScript ESM, Express 5, MongoDB, Redis):
> JWT auth with refresh-token rotation and theft detection, TOTP two-factor auth with recovery
> codes, per-device session management, RBAC, recurring tasks with race-safe spawning, full-text
> search, bulk operations with soft-delete trash retention, CSV/JSON import with idempotent
> partial-success semantics, an RFC 5545 iCal feed, HMAC-signed webhooks with automatic circuit
> breaking, task sharing with comments and an audit trail, PostHog analytics and Sentry error
> tracking, Redis-backed rate limiting, BullMQ job workers, Prometheus metrics, Docker Compose,
> and CI with typecheck/coverage/build gates — covered by 184 integration and unit tests.

---

## 🔜 Roadmap / Next Steps

- [x] Pagination/filtering
- [x] RBAC admin route
- [x] Swagger/OpenAPI documentation
- [x] CI pipeline (lint + format + tests + coverage gates)
- [x] Dockerfile + docker-compose
- [x] Refresh tokens with rotation & revocation
- [x] Task due dates, priorities, tags, `in_progress` status
- [x] Search, sort, stats, CSV export, recurring tasks
- [x] Email verification, password reset, due-date reminders
- [x] Idempotency, structured logging, metrics, Redis-backed limits
- [x] Sessions/device management + TOTP two-factor auth
- [x] Bulk operations + soft-delete trash with retention
- [x] CSV/JSON import + iCal calendar feed
- [x] Signed webhooks with retries and auto-disable
- [x] Task sharing with comments and activity trail
- [x] Full TypeScript (strict) + native ESM migration with zero behavior drift
- [x] Jest → Vitest port (184 tests) + compiled-dist boot smoke in CI-ready scripts
- [ ] Cursor-based pagination for deep pages
- [ ] Frontend client (React) consuming the API
