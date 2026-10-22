const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const authRoutes = require("./routes/auth");
const teamRoutes = require("./routes/teams");
const taskRoutes = require("./routes/tasks");

const app = express();

app.disable("x-powered-by");
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/", (req, res) => {
  res.json({
    name: "TaskMaster API",
    message: "Collaborative task tracking API",
    version: "1.0.0",
    health: "/health"
  });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRoutes);
app.use("/api/teams", teamRoutes);
app.use("/api", taskRoutes);
app.use("/api", require("./routes/attachments"));

app.use((req, res) => {
  res.status(404).json({ error: "Route not found." });
});

app.use((err, req, res, next) => {
  console.error(err);

  if (res.headersSent) return next(err);

  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Request body contains invalid JSON." });
  }

  if (err.code === "P2025") {
    return res.status(404).json({ error: "Requested record was not found." });
  }

  return res.status(500).json({ error: "Internal server error." });
});

module.exports = app;