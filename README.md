
---

# 📝 Task Management API

![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat\&logo=node.js\&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?style=flat\&logo=express\&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-47A248?style=flat\&logo=mongodb\&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue.svg)

A **RESTful API** for managing tasks built with **Node.js, Express, and MongoDB**.
Designed for learning, testing, and as a foundation for SaaS-style backends.

---

## 🚀 Features

* Full **CRUD operations** for tasks
* Persistent storage using **MongoDB**
* **Async/await controllers** for scalable backend
* **RESTful routes** with proper HTTP status codes
* **Health check endpoint** for monitoring server
* **Integration tests** using Jest + Supertest
* Modular structure: controllers, routes, models
* Ready for **authentication and RBAC** in later phases

---

## 📁 Folder Structure

```
task-api/
 ├─ index.js               # Express server entry
 ├─ package.json           # Dependencies & scripts
 ├─ config/
 │   └─ db.js              # MongoDB connection
 ├─ models/
 │   └─ task.model.js      # Mongoose Task schema
 ├─ controllers/
 │   └─ tasks.controller.js # Task CRUD logic
 ├─ routes/
 │   └─ tasks.routes.js     # Express router
 ├─ __tests__/
 │   └─ tasks.test.js       # Integration tests
 └─ .env                    # Environment variables
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
```

### 4️⃣ Start the server

```bash
npm run dev   # Nodemon for development
npm start     # Normal start
```

Server runs at `http://localhost:3000`

---

## 📌 API Endpoints

| Method | Endpoint   | Description         | Body Example                                      |
| ------ | ---------- | ------------------- | ------------------------------------------------- |
| GET    | /tasks     | Get all tasks       | N/A                                               |
| GET    | /tasks/:id | Get task by ID      | N/A                                               |
| POST   | /tasks     | Create a new task   | `{ "title": "Task 1", "description": "..." }`     |
| PUT    | /tasks/:id | Update a task       | `{ "title": "New Title", "status": "completed" }` |
| DELETE | /tasks/:id | Delete a task       | N/A                                               |
| GET    | /health    | Server health check | N/A                                               |

**HTTP Status Codes:**

* `200 OK` — Success
* `201 Created` — New resource created
* `204 No Content` — Deleted successfully
* `400 Bad Request` — Missing/invalid input
* `404 Not Found` — Resource not found

---

## 🛠 Technologies Used

* **Node.js** — Runtime environment
* **Express.js** — Web framework
* **MongoDB** — Database
* **Mongoose** — ODM for MongoDB
* **dotenv** — Environment configuration
* **Jest + Supertest** — Testing framework & HTTP assertions

---

## 💻 Example Usage

### Create a Task

```bash
POST /tasks
Content-Type: application/json

{
  "title": "Learn Node.js",
  "description": "Build a task API"
}
```

### Response

```json
{
  "_id": "64f8b3e2c1234567890abcd",
  "title": "Learn Node.js",
  "description": "Build a task API",
  "status": "pending",
  "createdAt": "2025-12-30T10:00:00.000Z",
  "updatedAt": "2025-12-30T10:00:00.000Z",
  "__v": 0
}
```

---

## 🧪 Running Tests

Tests use **MongoDB in-memory server** for fast and isolated testing:

```bash
npm test
```

---

## 🔹 Key Learnings

* Built **modular backend architecture**
* Integrated MongoDB for **persistent storage**
* Refactored controllers for **async/await**
* Wrote **database-backed integration tests**
* Ready for **authentication & RBAC**

---

## 🔜 Next Steps (Phase 4)

* Add **User authentication** (JWT)
* Password hashing
* Protected routes
* Role-based access control (RBAC)

---

## 📝 Resume / Portfolio Description

> Developed a modular RESTful API using Node.js, Express, and MongoDB. Implemented full CRUD operations, async controllers, database persistence, and integration tests using Jest and Supertest. Prepared the project for authentication and secure access control.

---

Do you want me to do that?
