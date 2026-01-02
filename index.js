const express = require("express");
const dotenv = require("dotenv");
const connectDB = require("./config/db.js");
const tasksRoutes = require("./routes/tasks_routes.js");
const authRoutes = require("./routes/auth_routes.js");

dotenv.config();
connectDB();

const app = express();
const PORT = process.env.PORT || 3000;


app.use(express.json());
app.use("/tasks", tasksRoutes);

app.use("/auth",authRoutes);

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
