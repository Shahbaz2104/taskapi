# 📝 Task Management API

![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat&logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?style=flat&logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-47A248?style=flat&logo=mongodb&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue.svg)
![CI](https://img.shields.io/badge/CI-passing-brightgreen)

A production-grade **RESTful Task Management API** built with **Node.js, Express 5, MongoDB (Mongoose)**, and **Redis**. Users register, log in with **JWT access + rotating refresh tokens**, and manage their **own** tasks with priorities, due dates, tags, search, recurring tasks, and CSV export. Includes role-based access control (admin/user), email verification, password reset, due-date reminders, rate limiting, idempotency, and 83 integration tests.

---

## 🚀 Features

- 🔐 **Full auth lifecycle** — register (email verification), login, refresh-token rotation, logout, forgot/reset password
- 🔑 **Role-based access control (RBAC)** — `admin` / `user` roles; admin user-management endpoints
- 📋 **Rich task domain** — `priority`, `dueDate`, `tags`, `in_progress` status, `recurrence` (daily/weekly/monthly)
- 🔎 **Search & sort** — full-text search, sort by createdAt/updatedAt/dueDate/priority rank
- 📊 **Stats endpoint** — counts by status/priority, overdue, completion rate (Redis-cached 60s)
- 📄 **CSV export** — download your tasks
- 🔁 **Recurring tasks** — completing one spawns the next occurrence
- ⏰ **Due-date reminders** — hourly BullMQ job emails you before deadlines
- 🛡️ **Security** — helmet, CORS, Redis-backed rate limiting (global + login/register/forgot/reset), bcrypt, refresh-token reuse detection
- 🧾 **Idempotency** — `Idempotency-Key` header dedupes retries on `POST /tasks`
- 📖 **Self-documenting API** — interactive Swagger UI at `/api-docs`
- 🧪 **Testing** — 83 tests (integration + unit), 82%+ line coverage with CI-enforced thresholds
- 🐳 **Dockerized** — `docker compose up` runs app + MongoDB + Redis with healthchecks
- 🚦 **CI pipeline** — GitHub Actions: lint + format check + tests with coverage on Node 20 & 22

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
                    └───────┬──────────────────────┬─────────────┘
                            │                      │
              ┌─────────────▼──────────┐  ┌────────▼──────────────┐
              │  MongoDB (Atlas/local) │  │  Redis 7              │
              │  users, tasks, tokens, │  │  • rate-limit store   │
              │  idempotency records   │  │  • stats cache (60s)  │
              │  • compound + text     │  │  • BullMQ broker      │
              │    indexes             │  │  • reminders cron     │
              └────────────────────────┘  └───────┬───────────────┘
                                                  │
                                     ┌────────────▼──────────────┐
                                     │ BullMQ workers            │
                                     │ • email worker (SMTP)     │
                                     │ • reminder job (hourly)   │
                                     └───────────────────────────┘
```

**Key design decisions**

- **Stateless replicas** — access tokens are self-validating JWTs, so any instance can serve any request; no sticky sessions.
- **Redis-backed rate limiting** — the in-memory default of `express-rate-limit` breaks under multiple replicas (limits multiply per instance). With Redis the limit is shared. If Redis is down, the app **fails soft** back to memory stores.
- **Refresh tokens in MongoDB, not Redis** — they're rotated on every use, revoked on logout/password change, and stored hashed (sha256). The DB gives us an audit trail and reuse detection (a revoked token being presented again revokes _all_ the user's sessions — the standard theft response).
- **Async emails via BullMQ** — SMTP is slow; verification/reset/reminder emails are enqueued and processed by a worker so the request path never blocks on the network.
- **Service layer** — controllers stay thin (HTTP concerns only); business logic (recurrence spawning, stats aggregation, token rotation, CSV) lives in `services/` and is unit-testable.
- **Idempotent task creation** — a unique `(user, key)` index reserves the response _before_ the task is created, so retries (and concurrent duplicates) return the original result.
- **Not over-engineered** — no microservices, no CQRS, no event sourcing. Monolith-first with Redis/queue as the first extractable pieces when a real scaling driver appears.

---

## 📁 Folder Structure

```
taskapi/
 ├─ index.js                    # Entry: env check, middleware, /api/v1 mount, workers, graceful shutdown
 ├─ package.json
 ├─ .env.example                # Environment variable template
 ├─ Dockerfile                  # Multi-stage production image
 ├─ docker-compose.yml          # App + MongoDB + Redis with healthchecks
 ├─ .github/workflows/ci.yml    # CI: lint + format + tests + coverage thresholds
 ├─ config/
 │   ├─ db.js                   # MongoDB connect/disconnect
 │   ├─ redis.js                # Redis client (soft-fail init)
 │   ├─ rate_limit.js           # Redis-backed limiter factory
 │   ├─ logger.js               # pino logger (silent under test)
 │   └─ swagger.js              # OpenAPI spec (served at /api-docs)
 ├─ models/
 │   ├─ users_models.js         # User (username, email, password, role, emailVerified)
 │   ├─ tasks_models.js         # Task (title, description, status, priority, dueDate, tags, recurrence)
 │   ├─ token_models.js         # Refresh tokens (hashed, revocable, expiring)
 │   └─ idempotency_models.js   # Idempotency records (TTL 24h)
 ├─ services/
 │   ├─ tasks.service.js        # Listing pipeline, stats, CSV, recurrence spawning
 │   ├─ auth.service.js         # Token issuance, rotation, revocation
 │   └─ email.service.js        # Nodemailer + BullMQ queue (direct-send fallback)
 ├─ jobs/
 │   ├─ email_worker.js         # BullMQ worker — sends queued emails
 │   └─ reminders.js            # Hourly repeatable job — due-date reminders
 ├─ controllers/
 │   ├─ auth_controller.js      # register / login / refresh / logout / verify / forgot / reset
 │   ├─ tasks_controller.js     # Task CRUD + stats + export + admin listing
 │   ├─ user_controller.js      # /me profile, password, account deletion
 │   └─ admin_controller.js     # User management (list / role / delete)
 ├─ routes/
 │   ├─ auth_routes.js          # /api/v1/auth (rate-limited)
 │   ├─ tasks_routes.js         # /api/v1/tasks (protected)
 │   ├─ user_routes.js          # /api/v1/me (protected)
 │   └─ admin_routes.js         # /api/v1/admin (admin only)
 ├─ middleware/
 │   ├─ auth_middleware.js      # protect — verifies Bearer JWT
 │   ├─ rbac.js                 # authorize(...roles) — role guard
 │   ├─ validate.js             # express-validator rules
 │   └─ error_handler.js        # central error handler (generic 5xx)
 └─ __tests__/
     ├─ tasks_test.js           # 65 integration tests
     ├─ server_test.js          # 6 server boot tests
     └─ unit_tests.js           # 12 unit tests (error handler, RBAC, service helpers)
```

---

## ⚡ Getting Started

### Prerequisites

- **Node.js 20.19+** (required by Mongoose 9)
- MongoDB instance (local or Atlas) — **Redis optional** (falls back to in-memory stores)

### Installation

```bash
git clone <repo-url>
cd taskapi
npm install
```

### Configuration

```bash
cp .env.example .env
```

| Variable            | Required | Description                                           | Default                            |
| ------------------- | -------- | ----------------------------------------------------- | ---------------------------------- |
| `PORT`              | ❌       | Server port                                           | `3000`                             |
| `MONGO_URI`         | ✅       | MongoDB connection string                             | —                                  |
| `JWT_SECRET`        | ✅       | Secret used to sign JWTs (keep long & random)         | —                                  |
| `REDIS_URL`         | ❌       | Redis connection (rate limits, cache, queue)          | none                               |
| `CLIENT_BASE_URL`   | ❌       | Base URL for emailed links                            | `http://localhost:3000`            |
| `ACCESS_TOKEN_TTL`  | ❌       | Access token lifetime (seconds)                       | `900`                              |
| `REFRESH_TOKEN_TTL` | ❌       | Refresh token lifetime (seconds)                      | `604800`                           |
| `CORS_ORIGIN`       | ❌       | Allowed CORS origin                                   | `*`                                |
| `SMTP_HOST`         | ❌       | SMTP server (without it, emails are logged, not sent) | none                               |
| `SMTP_PORT`         | ❌       | SMTP port (`465` = TLS)                               | `587`                              |
| `SMTP_USER`         | ❌       | SMTP username                                         | —                                  |
| `SMTP_PASS`         | ❌       | SMTP password                                         | —                                  |
| `SMTP_FROM`         | ❌       | From address for emails                               | `TaskAPI <no-reply@taskapi.local>` |

The server fails fast at startup if `MONGO_URI` or `JWT_SECRET` are missing.

### Run

```bash
npm run dev      # Development with nodemon
npm start        # Production start
```

### 🐳 Docker

```bash
docker compose up --build
```

Starts the API (`:3000`) + MongoDB + Redis with healthchecks. Override secrets via your `.env`.

### 📖 API Docs

Interactive Swagger UI at **`http://localhost:3000/api-docs`** — try every endpoint with the "Authorize" button.

---

## 🔐 Authentication

```
POST /auth/register  ──►  { accessToken, refreshToken }   (+ verification email)
POST /auth/login     ──►  { accessToken, refreshToken }
POST /auth/refresh   ──►  rotates the refresh token, returns a new pair
POST /auth/logout    ──►  revokes the refresh token
```

1. Send `Authorization: Bearer <accessToken>` on every `/tasks` request
2. When the access token expires (15m), call `/auth/refresh` with the refresh token (7d)
3. Refresh tokens are **rotated** on every use — a reused token revokes all sessions (theft detection)

> Usernames 3–30 chars; passwords 6–72 chars; email verified via emailed link.
> Login/register are rate-limited to **10 / 15 min** per IP; forgot-password to **5 / 15 min**.

---

## 📌 API Endpoints

All endpoints live under **`/api/v1`**.

### Auth (public)

| Method | Endpoint                | Description                        |
| ------ | ----------------------- | ---------------------------------- |
| POST   | `/auth/register`        | Create account, returns token pair |
| POST   | `/auth/login`           | Log in, returns token pair         |
| POST   | `/auth/refresh`         | Rotate a refresh token             |
| POST   | `/auth/logout`          | Revoke a refresh token             |
| POST   | `/auth/verify-email`    | Verify email with emailed token    |
| POST   | `/auth/forgot-password` | Request a reset link               |
| POST   | `/auth/reset-password`  | Set new password with token        |

### Tasks (protected — `Authorization: Bearer <token>`)

| Method | Endpoint        | Description                                                                     |
| ------ | --------------- | ------------------------------------------------------------------------------- |
| GET    | `/tasks`        | List your tasks (paginated, filtered, searched, sorted)                         |
| GET    | `/tasks/stats`  | Aggregated stats (by status/priority, overdue, completion rate)                 |
| GET    | `/tasks/export` | Download your tasks as CSV                                                      |
| GET    | `/tasks/:id`    | Get one of your tasks                                                           |
| POST   | `/tasks`        | Create a task (idempotent via `Idempotency-Key`)                                |
| PUT    | `/tasks/:id`    | Update a task (title, description, status, priority, dueDate, tags, recurrence) |
| DELETE | `/tasks/:id`    | Delete a task                                                                   |
| GET    | `/tasks/all`    | **Admin only** — paginated list of every task                                   |

### Account (protected)

| Method | Endpoint       | Description                            |
| ------ | -------------- | -------------------------------------- |
| GET    | `/me`          | Get your profile                       |
| PATCH  | `/me`          | Update username/email                  |
| PUT    | `/me/password` | Change password (revokes all sessions) |
| DELETE | `/me`          | Delete account + all data              |

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

## 🧪 Running Tests

```bash
npm test           # 83 tests: integration + unit, with coverage thresholds
npm run test:watch # Watch mode
```

Coverage thresholds are enforced (statements ≥80%, branches ≥60%, functions ≥70%, lines ≥82%) — CI fails if coverage drops. Run the report locally with `npm test -- --coverage`.

---

## 🛠 Technologies Used

- **Node.js 20.19+ / Express 5** — Runtime & web framework
- **MongoDB + Mongoose 9** — Database & ODM (compound + text indexes, aggregations)
- **Redis + BullMQ** — Shared rate limiting, stats cache, email queue, reminder cron
- **jsonwebtoken + bcryptjs** — JWT access tokens, hashed refresh tokens, password hashing
- **express-validator** — Input validation
- **helmet / cors / compression / express-rate-limit / rate-limit-redis** — Security & performance
- **pino + pino-http + prom-client** — Structured logging, request IDs, metrics
- **nodemailer** — Email delivery (SMTP)
- **swagger-jsdoc + swagger-ui-express** — OpenAPI docs
- **Jest + Supertest + mongodb-memory-server** — Testing

---

## ☁️ Deployment

The API is Docker-ready and deploys as-is to **Render**, **Railway**, or **Fly.io**:

1. Create a **MongoDB Atlas** cluster and a **Redis** instance (or use the compose one)
2. Set env vars: `MONGO_URI`, `JWT_SECRET`, `REDIS_URL`, `SMTP_*` (for emails), `CORS_ORIGIN`
3. Build `npm ci`, start `npm start` — the `/ready` probe drives health checks

When you have a live URL, paste it into the `servers` array in `config/swagger.js`
and swap the static CI badge for a live one from GitHub's actions page.

---

## 📝 Resume / Portfolio Description

> Built a production-grade RESTful Task Management API (Node.js, Express, MongoDB, Redis):
> JWT auth with refresh-token rotation and theft detection, email verification and password
> reset, RBAC, recurring tasks, full-text search, CSV export, Redis-backed rate limiting,
> BullMQ email queue with due-date reminders, idempotent writes, Prometheus metrics,
> Docker Compose, CI with coverage gates — covered by 83 integration and unit tests.

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
- [ ] Cursor-based pagination for deep pages
- [ ] Shared/assigned tasks + comments (collaboration)
- [ ] Frontend client (React) consuming the API
