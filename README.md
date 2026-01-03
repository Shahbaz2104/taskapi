
---

# 📝 Task Management API (Phase 4 — Auth & Protected Routes)

![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat\&logo=node.js\&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?style=flat\&logo=express\&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-47A248?style=flat\&logo=mongodb\&logoColor=white)
![JWT](https://img.shields.io/badge/JWT-000000?style=flat\&logo=jsonwebtokens\&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue.svg)

A **secure RESTful API** for managing tasks with **Node.js, Express, MongoDB, and JWT authentication**.
Users can **register, login, and manage their own tasks**. All task routes are **protected**, ensuring user-specific access.

---

## 🚀 Features (Phase 4)

* Full **CRUD operations** for tasks
* Persistent storage using **MongoDB**
* **User authentication** (JWT)
* **Password hashing** using bcrypt
* **Protected routes** — users can only access their own tasks
* **Async/await controllers** for scalability
* **RESTful routes** with proper HTTP status codes
* **Health check endpoint**
* **Integration tests** using Jest + Supertest
* Modular structure: controllers, routes, models, middleware

---

## 📁 Folder Structure

```
task-api/
 ├─ index.js                  # Express server entry
 ├─ package.json              # Dependencies & scripts
 ├─ config/
 │   └─ db.js                 # MongoDB connection
 ├─ models/
 │   ├─ task.model.js         # Mongoose Task schema (linked to user)
 │   └─ user.model.js         # Mongoose User schema
 ├─ controllers/
 │   ├─ tasks.controller.js   # Task CRUD logic (user-protected)
 │   └─ auth.controller.js    # User registration & login
 ├─ routes/
 │   ├─ tasks.routes.js       # Task routes (protected)
 │   └─ auth.routes.js        # Auth routes (public)
 ├─ middleware/
 │   └─ auth.middleware.js    # JWT token verification
 ├─ __tests__/
 │   └─ tasks.test.js         # Integration tests with in-memory MongoDB
 └─ .env                       # Environment variables
```

---

## ⚡ Getting Started

### 1️⃣ Clone the repository

```bash
git clone <repo-url>
cd task-api
```

### 2️⃣ Install dependencies

```bash
npm install
```

### 3️⃣ Configure environment variables

Create a `.env` file:

```env
PORT=3000
MONGO_URI=mongodb://localhost:27017/task_api
JWT_SECRET=supersecretkey
```

### 4️⃣ Start the server

```bash
npm run dev   # Nodemon for development
npm start     # Normal start
```

Server runs at `http://localhost:3000`

---

## 📌 API Endpoints (Phase 4)

### Authentication

| Method | Endpoint       | Body Example                                 | Auth |
| ------ | -------------- | -------------------------------------------- | ---- |
| POST   | /auth/register | `{ "username": "user", "password": "pass" }` | ❌    |
| POST   | /auth/login    | `{ "username": "user", "password": "pass" }` | ❌    |

**Login Response Example:**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

### Tasks (Protected — Require JWT)

> **Headers required:**
> `Authorization: Bearer <JWT_TOKEN>`

| Method | Endpoint   | Body Example                                    | Description                      |
| ------ | ---------- | ----------------------------------------------- | -------------------------------- |
| GET    | /tasks     | N/A                                             | Get all tasks for logged-in user |
| GET    | /tasks/:id | N/A                                             | Get a single task by ID          |
| POST   | /tasks     | `{ "title": "Task", "description": "..." }`     | Create a new task                |
| PUT    | /tasks/:id | `{ "title": "Updated", "status": "completed" }` | Update an existing task          |
| DELETE | /tasks/:id | N/A                                             | Delete a task by ID              |

---

### Health Check

| Method | Endpoint | Description         |
| ------ | -------- | ------------------- |
| GET    | /health  | Check server uptime |

---

## 💻 Example Usage

### Register a User

```bash
POST /auth/register
Content-Type: application/json

{
  "username": "john",
  "password": "password123"
}
```

### Login

```bash
POST /auth/login
Content-Type: application/json

{
  "username": "john",
  "password": "password123"
}
```

**Response:**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Create a Task (Authenticated)

```bash
POST /tasks
Authorization: Bearer <TOKEN>
Content-Type: application/json

{
  "title": "Finish API",
  "description": "Test auth-protected endpoints"
}
```

**Response:**

```json
{
  "_id": "64f8b3e2c1234567890abcd",
  "title": "Finish API",
  "description": "Test auth-protected endpoints",
  "status": "pending",
  "user": "64f8b3d1c1234567890abc9",
  "createdAt": "2026-01-03T12:00:00.000Z",
  "updatedAt": "2026-01-03T12:00:00.000Z",
  "__v": 0
}
```

---

## 🧪 Running Tests

Integration tests use **in-memory MongoDB**:

```bash
npm test
```

Tests cover:

* User registration & login
* JWT token verification
* Task CRUD operations
* User-specific access (protected routes)

---

## 🔹 Key Learnings

* Built **modular backend architecture**
* Integrated **MongoDB** for persistence
* Implemented **JWT authentication**
* Password hashing using **bcrypt**
* Protected routes for **user-specific data access**
* Async/await controllers
* Database-backed **integration tests**

---

## 🔜 Next Steps (Phase 5)

* Role-Based Access Control (RBAC — Admin vs User)
* Input validation (Joi/Zod)
* Centralized error handling
* Dockerization & deployment
* Pagination and filtering for tasks

---

## 📝 Resume / Portfolio Description

> Developed a secure RESTful API with Node.js, Express, and MongoDB. Implemented user authentication with JWT, password hashing, and user-specific task management. Refactored controllers to async/await and wrote database-backed integration tests using Jest and Supertest. Project is production-ready and structured for RBAC and further SaaS-style features.

---

## License

MIT License © 2026


