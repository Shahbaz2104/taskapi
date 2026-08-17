# 📝 Task Management API

![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat&logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?style=flat&logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-47A248?style=flat&logo=mongodb&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue.svg)
![CI](https://img.shields.io/badge/CI-passing-brightgreen)

A **RESTful Task Management API** built with **Node.js, Express 5, and MongoDB (Mongoose)**.
Users register, log in with **JWT**, and manage their **own** tasks. Includes **role-based
access control** (admin/user), input validation, rate limiting, and pagination.

---

## 🚀 Features

- 🔐 **JWT authentication** — register, login, protected routes
- 🔑 **Role-based access control (RBAC)** — `admin` / `user` roles with an admin-only route
- 📋 **User-scoped tasks** — every user only sees and edits their own tasks
- 📄 **Pagination & filtering** — `GET /tasks?page=&limit=&status=`
- 🛡️ **Security** — helmet, CORS, rate limiting (global + stricter login/register limiters), bcrypt hashing
- ✅ **Input validation** — express-validator on all write endpoints
- 📖 **Self-documenting API** — interactive Swagger UI at `/api-docs`
- 🧪 **Integration tests** — 32 tests with Jest + Supertest + in-memory MongoDB
- 🐳 **Dockerized** — `docker compose up` runs app + MongoDB with healthchecks
- 🚦 **CI pipeline** — GitHub Actions: lint + format check + tests with coverage on Node 20 & 22
- 🧱 **Modular architecture** — routes / controllers / models / middleware / config

---

## 📁 Folder Structure

```
taskapi/
 ├─ index.js                    # Express server entry (env check, middleware, graceful shutdown)
 ├─ package.json
 ├─ .env.example                # Environment variable template
 ├─ Dockerfile                  # Multi-stage production image
 ├─ docker-compose.yml          # App + MongoDB with healthchecks
 ├─ .github/workflows/ci.yml    # CI: lint + format + tests + coverage
 ├─ config/
 │   ├─ db.js                   # MongoDB connect/disconnect
 │   └─ swagger.js              # OpenAPI spec (served at /api-docs)
 ├─ models/
 │   ├─ users_models.js         # User schema (username, password, role) + bcrypt hashing
 │   └─ tasks_models.js         # Task schema (title, description, status, user ref)
 ├─ controllers/
 │   ├─ auth_controller.js      # register / login
 │   └─ tasks_controller.js     # Task CRUD + admin listing
 ├─ routes/
 │   ├─ auth_routes.js          # /auth routes (login/register rate-limited)
 │   └─ tasks_routes.js         # /tasks routes (all protected)
 ├─ middleware/
 │   ├─ auth_middleware.js      # protect — verifies Bearer JWT
 │   ├─ rbac.js                 # authorize(...roles) — role guard
 │   ├─ validate.js             # express-validator rules
 │   └─ error_handler.js        # central error handler
 └─ __tests__/
     ├─ tasks_test.js           # API integration tests
     └─ server_test.js          # Server boot tests (health, ready, Swagger)
```

---

## ⚡ Getting Started

### Prerequisites

- **Node.js 20.19+** (required by Mongoose 9)
- MongoDB instance (local or Atlas)

### Installation

```bash
git clone <repo-url>
cd taskapi
npm install
```

### Configuration

Copy the environment template and fill in your values:

```bash
cp .env.example .env
```

| Variable      | Description                                      | Example                             |
| ------------- | ------------------------------------------------ | ----------------------------------- |
| `PORT`        | Server port                                      | `3000`                              |
| `MONGO_URI`   | MongoDB connection string                        | `mongodb+srv://user:pass@cluster/…` |
| `JWT_SECRET`  | Secret used to sign JWTs (keep it long & random) | `change-me-to-a-long-random-string` |
| `CORS_ORIGIN` | _(optional)_ Allowed CORS origin                 | `https://myapp.com`                 |

The server fails fast at startup if `MONGO_URI` or `JWT_SECRET` are missing.

### Run

```bash
npm run dev      # Development with nodemon
npm start        # Production start
```

Server runs at `http://localhost:3000` (health check: `GET /health`).

### 📖 API Docs

Interactive Swagger UI at **`http://localhost:3000/api-docs`** — try every endpoint
with the "Authorize" button (paste a token from `/auth/register` or `/auth/login`).

### 🐳 Docker

```bash
docker compose up --build
```

Starts the API (`:3000`) + MongoDB with healthchecks. Override secrets via your `.env`:

```bash
JWT_SECRET=your-long-random-secret docker compose up --build
```

---

## 🔐 Authentication

1. **Register** → `POST /auth/register` returns a JWT immediately
2. **Login** → `POST /auth/login` returns a JWT
3. **Use** → send `Authorization: Bearer <token>` on every `/tasks` request

> Usernames must be 3–30 characters; passwords 6–72 characters. Login **and** registration
> are rate-limited to **10 attempts / 15 minutes** per IP to slow down brute-force and
> account-spam attacks.

---

## 📌 API Endpoints

### Auth (public)

| Method | Endpoint         | Description                 | Body                                             |
| ------ | ---------------- | --------------------------- | ------------------------------------------------ |
| POST   | `/auth/register` | Create account, returns JWT | `{ "username": "alice", "password": "secret1" }` |
| POST   | `/auth/login`    | Log in, returns JWT         | `{ "username": "alice", "password": "secret1" }` |

### Tasks (protected — `Authorization: Bearer <token>`)

| Method | Endpoint     | Description                              | Body                                      |
| ------ | ------------ | ---------------------------------------- | ----------------------------------------- |
| GET    | `/tasks`     | List your tasks (paginated, filterable)  | N/A                                       |
| GET    | `/tasks/:id` | Get one of your tasks                    | N/A                                       |
| POST   | `/tasks`     | Create a task                            | `{ "title": "…", "description": "…" }`    |
| PUT    | `/tasks/:id` | Update a task (at least one field)       | `{ "title": "…", "status": "completed" }` |
| DELETE | `/tasks/:id` | Delete a task                            | N/A                                       |
| GET    | `/tasks/all` | **Admin only** — list every user's tasks | N/A                                       |

### Query params on `GET /tasks`

| Param    | Type   | Description                      | Default |
| -------- | ------ | -------------------------------- | ------- |
| `page`   | number | Page number (1-based)            | `1`     |
| `limit`  | number | Results per page (max 100)       | `10`    |
| `status` | string | Filter: `pending` or `completed` | none    |

Example: `GET /tasks?page=2&limit=5&status=completed`

Response shape:

```json
{
  "tasks": [{ "_id": "…", "title": "…", "status": "pending", "user": "…" }],
  "total": 12,
  "page": 2,
  "limit": 5,
  "totalPages": 3
}
```

### Other

| Method | Endpoint    | Description                                  |
| ------ | ----------- | -------------------------------------------- |
| GET    | `/health`   | Server health check                          |
| GET    | `/ready`    | Readiness probe (checks DB, for deployments) |
| GET    | `/api-docs` | Interactive Swagger UI docs                  |

**HTTP Status Codes:**

- `200 OK` — Success
- `201 Created` — New resource created
- `204 No Content` — Deleted successfully
- `400 Bad Request` — Missing/invalid input
- `401 Unauthorized` — Missing/expired/invalid token
- `403 Forbidden` — Authenticated but not allowed (RBAC)
- `404 Not Found` — Resource or route not found
- `429 Too Many Requests` — Rate limit exceeded
- `500 Internal Server Error` — Server failure

---

## 👥 Role-Based Access Control

- Every user is created with `role: "user"` by default.
- An **admin** can access `GET /tasks/all` to see every user's tasks.
- A regular user gets `403 Forbidden` on that route.
- To make a user an admin, update the `role` field in MongoDB directly:

```js
db.users.updateOne({ username: "alice" }, { $set: { role: "admin" } });
```

---

## 🧪 Running Tests

Tests run against an **in-memory MongoDB** (no local DB needed):

```bash
npm test           # Run once
npm run test:watch # Watch mode
```

Coverage includes: registration (duplicates, weak passwords, short usernames), login, JWT
verification, task CRUD, user isolation, mass-assignment protection, pagination, status
filtering, input validation (invalid IDs, invalid status, empty updates, over-long titles),
RBAC, server boot, readiness probe, and Swagger availability.

---

## ☁️ Deployment

The API is Docker-ready and deploys as-is to **Render**, **Railway**, or **Fly.io**:

| Variable      | Required | Notes                                       |
| ------------- | -------- | ------------------------------------------- |
| `MONGO_URI`   | ✅       | MongoDB Atlas connection string             |
| `JWT_SECRET`  | ✅       | Long random string (`openssl rand -hex 32`) |
| `CORS_ORIGIN` | ❌       | Set to your frontend origin in production   |
| `PORT`        | ❌       | Platforms inject this automatically         |

**Render quickstart:** create a _Web Service_ → connect repo → build `npm ci` →
start `npm start` → add the env vars above. The `/ready` probe is used for health checks.
When you have a live URL, paste it into the `servers` array in `config/swagger.js`
and swap the static CI badge in this README for a live badge from GitHub's actions page.

---

## 🛠 Technologies Used

- **Node.js 20.19+** — Runtime
- **Express 5** — Web framework
- **MongoDB + Mongoose 9** — Database & ODM
- **jsonwebtoken** — JWT auth
- **bcryptjs** — Password hashing
- **express-validator** — Input validation
- **helmet / cors / express-rate-limit** — Security hardening
- **Jest + Supertest + mongodb-memory-server** — Testing

---

## 📝 Resume / Portfolio Description

> Developed a secure RESTful Task Management API using Node.js, Express, and MongoDB with JWT
> authentication, bcrypt password hashing, role-based access control, input validation, rate
> limiting, and pagination — fully covered by 32 integration tests, with Swagger docs, Docker,
> and a CI pipeline.

---

## 🔜 Roadmap / Next Steps

- [ ] Pagination/filtering — ✅ done
- [ ] RBAC admin route — ✅ done
- [ ] Swagger/OpenAPI documentation — ✅ done
- [ ] CI pipeline (GitHub Actions: lint + test) — ✅ done
- [ ] Dockerfile + docker-compose for deployment — ✅ done
- [ ] Task due dates, priorities, and an `in_progress` status
- [ ] Refresh tokens / token revocation
