jest.setTimeout(30000); // 30 seconds timeout for in-memory MongoDB

const mongoose = require("mongoose");
const request = require("supertest");
const { MongoMemoryServer } = require("mongodb-memory-server");
const express = require("express");
const bodyParser = require("body-parser");

// Import your Task schema
const TaskSchema = require("../models/tasks_models.js").schema;

let mongoServer;
let testConnection;
let TaskModel;
let app;

// Controllers wrapped to use in-memory TaskModel
const makeController = (Model) => {
  return {
    getAllTasks: async (req, res) => {
      try {
        const tasks = await Model.find();
        res.status(200).json(tasks);
      } catch (err) {
        res.status(500).json({ error: "Internal server error" });
      }
    },
    getTasksbyId: async (req, res) => {
      try {
        const task = await Model.findById(req.params.id);
        if (!task) return res.status(404).json({ error: "Task not found" });
        res.status(200).json(task);
      } catch (err) {
        res.status(500).json({ error: "Internal server error" });
      }
    },
    createTask: async (req, res) => {
      try {
        const { title, description } = req.body;
        if (!title) return res.status(400).json({ error: "Title is required" });
        const task = await Model.create({ title, description });
        res.status(201).json(task);
      } catch (err) {
        res.status(500).json({ error: "Internal server error" });
      }
    },
    updateTask: async (req, res) => {
      try {
        const task = await Model.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!task) return res.status(404).json({ error: "Task not found" });
        res.status(200).json(task);
      } catch (err) {
        res.status(500).json({ error: "Internal server error" });
      }
    },
    deleteTask: async (req, res) => {
      try {
        const task = await Model.findByIdAndDelete(req.params.id);
        if (!task) return res.status(404).json({ error: "Task not found" });
        res.status(204).send();
      } catch (err) {
        res.status(500).json({ error: "Internal server error" });
      }
    },
  };
};

beforeAll(async () => {
  // Start in-memory MongoDB
  mongoServer = await MongoMemoryServer.create();
  testConnection = await mongoose.createConnection(mongoServer.getUri());
  
  // Bind Task model to test connection
  TaskModel = testConnection.model("Task", TaskSchema);

  // Create controllers for this test connection
  const controllers = makeController(TaskModel);

  // Create Express app for testing
  app = express();
  app.use(bodyParser.json());

  app.post("/tasks", (req, res) => controllers.createTask(req, res));
  app.get("/tasks", (req, res) => controllers.getAllTasks(req, res));
  app.get("/tasks/:id", (req, res) => controllers.getTasksbyId(req, res));
  app.put("/tasks/:id", (req, res) => controllers.updateTask(req, res));
  app.delete("/tasks/:id", (req, res) => controllers.deleteTask(req, res));
});

afterAll(async () => {
  await testConnection.dropDatabase();
  await testConnection.close();
  await mongoServer.stop();
});

afterEach(async () => {
  await TaskModel.deleteMany({});
});

describe("Tasks API (MongoDB)", () => {
  it("creates a task", async () => {
    const res = await request(app)
      .post("/tasks")
      .send({ title: "Test Task", description: "Test description" });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe("Test Task");
  });

  it("gets all tasks", async () => {
    await TaskModel.create({ title: "Task 1" });
    const res = await request(app).get("/tasks");
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
  });

  it("gets task by id", async () => {
    const task = await TaskModel.create({ title: "Task 2" });
    const res = await request(app).get(`/tasks/${task._id}`);
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Task 2");
  });

  it("updates a task", async () => {
    const task = await TaskModel.create({ title: "Old Title" });
    const res = await request(app)
      .put(`/tasks/${task._id}`)
      .send({ title: "New Title" });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("New Title");
  });

  it("deletes a task", async () => {
    const task = await TaskModel.create({ title: "Task to Delete" });
    const res = await request(app).delete(`/tasks/${task._id}`);
    expect(res.status).toBe(204);
    const tasksLeft = await TaskModel.find();
    expect(tasksLeft.length).toBe(0);
  });
});
