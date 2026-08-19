# 📊 TaskAPI — Project Status & Improvement Report

> **Date:** 2026-08-19 · **Last updated:** 2026-08-19 (A+B features + design hardening pass)
> **Verdict:** ✅ Working. **83/83 tests pass** (65 integration + 6 boot + 12 unit), coverage gates enforced, `npm audit` clean.

---

## 1. What This Project Is

A production-grade **RESTful Task Management API** — Node.js + Express 5 + MongoDB (Mongoose 9)

- Redis. Full auth lifecycle (access + rotating refresh tokens, email verification, password
  reset), rich task domain (priority, due dates, tags, recurrence, search, sort, stats, CSV
  export), RBAC with admin user management, Redis-backed rate limiting, BullMQ email queue with
  due-date reminders, idempotent writes, pino logging, Prometheus metrics, Swagger docs, Docker,
  and a CI pipeline with coverage gates.

---

## 2. Progress Phases

| Phase                                                        | Status               |
| ------------------------------------------------------------ | -------------------- |
| Initial scaffold + Express server                            | ✅ Done              |
| MongoDB connection (Atlas)                                   | ✅ Done              |
| Task CRUD + JWT auth + bcrypt                                | ✅ Done              |
| Security middleware + validation                             | ✅ Done              |
| RBAC admin route, pagination, filtering                      | ✅ Done              |
| Graceful shutdown, `/health`, `/ready`                       | ✅ Done              |
| Tier 1 portfolio pass (Swagger, Docker, CI, lint, hardening) | ✅ Done (2026-08-18) |
| **A+B features + design hardening**                          | ✅ Done (2026-08-19) |

---

## 3. What Was Built in the A+B + Design Pass (2026-08-19)

### 🎯 Task domain

- `priority` (low/medium/high), `dueDate`, `tags` (≤5), `in_progress` status, `recurrence`
  (daily/weekly/monthly), `reminderSent` flag; text index + `{user, createdAt}` compound index
- `GET /tasks` — full-text `search=`, `sort=` (incl. priority rank via `$switch` aggregation,
  `$facet` returns data + total in one pass)
- `GET /tasks/stats` — by status/priority, overdue, completion rate (Redis-cached 60s)
- `GET /tasks/export` — hand-rolled CSV (no deps), escaping included
- Recurrence: completing a recurring task spawns the next occurrence (idempotent on transition)
- `Idempotency-Key` on `POST /tasks` — unique-index reservation before creation (race-safe)

### 🔐 Auth overhaul

- `email` now required on registration (unique, lowercase); `emailVerified` flag
- Access token 15m (JWT) + refresh token 7d (opaque, sha256-hashed in Mongo `Token` model)
- `/auth/refresh` rotates tokens; **reuse detection** revokes all sessions (theft response)
- `/auth/logout`, `/auth/verify-email`, `/auth/forgot-password` (generic response, rate-limited),
  `/auth/reset-password` (revokes all sessions)

### 📧 Email & jobs

- `services/email.service.js` — Nodemailer; dev mode (no SMTP) logs + echoes verification URL
- BullMQ queue + worker for emails; hourly repeatable reminder job (due ≤24h, `reminderSent`)
- Tests keep working without Redis (soft-fail: memory stores + direct send / no-op)

### 👤 Account & admin

- `GET/PATCH /me`, `PUT /me/password` (revokes sessions), `DELETE /me` (cascades tasks+tokens)
- `GET /admin/users` (pagination + search + role filter), `PATCH /admin/users/:id` (no self-demote),
  `DELETE /admin/users/:id` (no self-delete, cascades)

### 🏗 Design hardening

- **Service layer** — business logic moved out of controllers (`services/tasks|auth|email`)
- **`/api/v1`** prefix on all API routes
- **Redis** — shared rate-limit store (soft-fallbacks to memory), stats cache, BullMQ broker
- **Observability** — pino + pino-http (request IDs, auth-header redaction), gzip, `/metrics`
  (prom-client)
- **README System Design section** with architecture diagram + decision log

---

## 4. Verified Working (2026-08-19)

```
Test Suites: 3 passed, 3 total
Tests:       83 passed, 83 total
```

Coverage (local): statements 82%, branches 65%, functions 74%, lines 85% —
thresholds set in `package.json` (80/60/70/82), enforced by CI.
`npm audit` → 0 vulnerabilities. `npm run lint` + `format:check` → clean.

---

## 5. Architecture (current)

```
taskapi/
 ├─ index.js               # Env check, helmet/cors/compression/pino, /api/v1, /metrics, workers
 ├─ config/                # db, redis (soft-fail), rate_limit (Redis store), logger (pino), swagger
 ├─ models/                # users, tasks, tokens (refresh), idempotency (TTL)
 ├─ services/              # tasks (list/stats/csv/recurrence), auth (rotation/revocation), email (queue)
 ├─ jobs/                  # email_worker (BullMQ), reminders (hourly repeatable)
 ├─ controllers/           # auth, tasks, user (/me), admin
 ├─ routes/                # auth (rate-limited), tasks (protected), user, admin (RBAC)
 ├─ middleware/            # protect (JWT), authorize (RBAC), validate, error_handler
 ├─ __tests__/             # 65 integration + 6 server boot + 12 unit
 └─ .github/workflows/ci.yml
```

---

## 6. Remaining / Optional Improvements (roadmap)

1. **Cursor-based pagination** for deep pages (skip/limit documented as a tradeoff).
2. **Collaboration** — shared/assigned tasks, comments, activity feed.
3. **Frontend client** — small React app consuming the API.
4. **Live deployment** — push to Render/Railway, add live URL + dynamic CI badge.
5. **SMTP integration test** — with Mailhog in CI (email paths currently untested by design).
6. **Docker verification** — `docker compose up` needs a local Docker run (not available on dev box).
7. **Coverage badge** — connect Codecov or generate locally in CI.

---

_Keep this report updated as the project evolves._
