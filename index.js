const http = require("http");
const express = require("express")
const app = express()
const PORT = process.env.PORT || 3000;

const taskRoutes = require("../taskapi/routes/tasks_routes.js");

app.use(express.json());

app.use("/tasks", taskRoutes);


// Health check
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.listen(PORT, () => {
  console.log(`Server is running on ${PORT}`);
});

module.exports = app
