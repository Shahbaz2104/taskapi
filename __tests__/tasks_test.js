const request = require("supertest");
const app = require("../index");

describe("Tasks API", () => {
  let taskId;

  // Test GET /tasks (empty array initially)
  it("should return empty array initially", async () => {
    const res = await request(app).get("/tasks");
    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual([]);
  });

  // Test POST /tasks
  it("should create a new task", async () => {
    const res = await request(app)
      .post("/tasks")
      .send({ title: "Test Task", description: "This is a test" });
    expect(res.statusCode).toEqual(201);
    expect(res.body).toHaveProperty("id");
    expect(res.body.title).toBe("Test Task");

    taskId = res.body.id; // Save ID for later
  });

  // Test GET /tasks/:id
  it("should get the created task by id", async () => {
    const res = await request(app).get(`/tasks/${taskId}`);
    expect(res.statusCode).toEqual(200);
    expect(res.body.id).toBe(taskId);
    expect(res.body.title).toBe("Test Task");
  });

  // Test PUT /tasks/:id
  it("should update the task", async () => {
    const res = await request(app)
      .put(`/tasks/${taskId}`)
      .send({ status: "completed" });
    expect(res.statusCode).toEqual(200);
    expect(res.body.status).toBe("completed");
  });

  // Test DELETE /tasks/:id
  it("should delete the task", async () => {
    const res = await request(app).delete(`/tasks/${taskId}`);
    expect(res.statusCode).toEqual(204);
  });

  // Test GET /tasks/:id after deletion
  it("should return 404 for deleted task", async () => {
    const res = await request(app).get(`/tasks/${taskId}`);
    expect(res.statusCode).toEqual(404);
  });
});
