# 📊 TaskAPI — Project Status & Improvement Report

> **Date:** 2026-08-18 · **Last updated:** 2026-08-18 (Tier 1 portfolio upgrade pass)
> **Verdict:** ✅ Working and well-structured. **32/32 integration tests pass** (25 API + 3 hardening + 4 server boot).

---

## 1. What This Project Is

A RESTful **Task Management API** built with **Node.js + Express 5 + MongoDB (Mongoose 9) + JWT auth**.
Users register, log in, and manage their **own** tasks, with role-based access control (admin/user).

---

## 2. Progress Phases

| Phase                                                                              | Status             |
| ---------------------------------------------------------------------------------- | ------------------ |
| Initial scaffold + Express server                                                  | ✅ Done            |
| MongoDB connection (MongoDB Atlas)                                                 | ✅ Done            |
| Task CRUD (controllers, routes, models)                                            | ✅ Done            |
| JWT authentication + bcrypt password hashing                                       | ✅ Done            |
| Security middleware (helmet, CORS, rate limiting)                                  | ✅ Done            |
| Validation middleware (express-validator)                                          | ✅ Done            |
| Integration tests (Jest + Supertest + mongodb-memory-server)                       | ✅ Done (32 tests) |
| **RBAC wired into an admin-only route** (`GET /tasks/all`)                         | ✅ Done            |
| **Pagination + status filtering** on `GET /tasks`                                  | ✅ Done            |
| **Graceful shutdown** (SIGINT/SIGTERM)                                             | ✅ Done            |
| **Hardening pass** (mass-assignment guard, register limiter, task index, `/ready`) | ✅ Done            |
| **Swagger/OpenAPI docs** at `/api-docs`                                            | ✅ Done            |
| **ESLint + Prettier** (flat config, `npm run lint` / `format`)                     | ✅ Done            |
| **Docker** (multi-stage Dockerfile, compose with Mongo + healthchecks)             | ✅ Done            |
| **CI pipeline** (GitHub Actions: lint + format + tests + coverage, Node 20 & 22)   | ✅ Done            |
| README matching the real codebase                                                  | ✅ Done            |

---

## 3. Fixes Completed in This Pass

### 🔴 Critical bugs

- **Register race condition** — registration now relies on the unique index and catches the
  duplicate-key error (`code 11000`) → returns `400 "User exists"` instead of a 500.
- **Password validation** — passwords must be **6–72 characters** (schema + validator); usernames
  **3–30** characters.
- **Empty-body updates** — `PUT /tasks/:id {}` now returns `400` ("At least one field to update is required").

### 🟠 Security

- **Fail-fast env validation** — server exits at boot if `MONGO_URI` or `JWT_SECRET` are missing.
- **Stricter login rate limit** — 10 attempts / 15 min per IP (skipped under `NODE_ENV=test`).
- **Length caps** — `title` ≤ 200, `description` ≤ 2000, `username` 3–30, `password` 6–72.
- **Expired-token messaging** — 401 now distinguishes "Token expired" from "Invalid token".
- **Generic 5xx messages** — error handler no longer leaks internal error details on server errors.
- Optional `CORS_ORIGIN` env var for restricting CORS in production.

### 🟡 Code quality

- **RBAC is now used** — `GET /tasks/all` (admin-only) wired through `authorize("admin")`.
- Removed redundant `!title` check in `createTask` (validation middleware covers it).
- Removed redundant try/catch from task controllers (Express 5 forwards async errors to the
  central error handler); `auth_controller` keeps one targeted try/catch for the 11000 mapping.
- Renamed `getTasksbyId` → `getTaskById`.
- **Register returns a token** — no separate login call needed after signup.
- `package.json` — description, `license: MIT` (matches README badge), `engines: node >=20.19`,
  `test:watch` script, dropped deprecated `--forceExit`.
- Switched rate limiter to the non-deprecated `limit` option.
- `config/db.js` exports `connectDB` + `disconnectDB` for graceful shutdown.

### 🔵 Features & tests

- **Pagination & filtering** — `GET /tasks?page=&limit=&status=` returns
  `{ tasks, total, page, limit, totalPages }` (max limit 100, sorted newest first).
- **Graceful shutdown** — SIGINT/SIGTERM close the server and disconnect MongoDB.
- **Tests grew 13 → 25**, adding: weak password, short username, over-long title, invalid token,
  malformed ID, empty-body update, invalid status, pagination, status filter, 404s, and RBAC
  (403 for users, 200 for admins).

---

## 4. Verified Working (2026-08-18)

```
Test Suites: 2 passed, 2 total
Tests:       32 passed, 32 total
```

Server boot tests now cover `/health`, `/ready` (DB ping), 404 route, and Swagger UI
availability. `npm audit` → **0 vulnerabilities**. `npm run lint` → clean.

---

## 5. Architecture (current)

```
taskapi/
 ├─ index.js                    # Env validation, helmet/cors/rate-limit, routes, graceful shutdown
 ├─ config/db.js                # connectDB / disconnectDB
 ├─ models/                     # users_models.js, tasks_models.js
 ├─ controllers/                # auth_controller.js, tasks_controller.js
 ├─ routes/                     # auth_routes.js (login rate-limited), tasks_routes.js (RBAC /all)
 ├─ middleware/                 # auth_middleware.js, rbac.js, validate.js, error_handler.js
 ├─ __tests__/tasks_test.js     # 25 integration tests
 └─ PROJECT_STATUS.md           # this report
```

---

## 6. Remaining / Optional Improvements (roadmap)

1. **Admin user management** — an endpoint to promote/demote users instead of editing the DB.
2. **Task due dates, priorities**, and an `in_progress` status.
3. **Refresh tokens / token revocation**.
4. **Live deployment** — push to Render/Railway, add live URL + dynamic CI badge.
5. **Pagination on the admin route** (`GET /tasks/all` returns everything today).
6. **Coverage badge** — connect Codecov or generate locally in CI.
7. **Frontend demo client** — small React app consuming the API.

---

_Keep this report updated as the project evolves._
