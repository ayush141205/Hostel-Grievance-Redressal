const express = require("express");
const cors = require("cors");
const app = express();

const complaintRoutes = require("./routes/complaintRoutes");
const studentRoutes = require("./routes/studentRoutes");
const wardenRoutes = require("./routes/wardenRoutes");
const userRoutes = require("./routes/userRoutes");
const { checkDatabaseHealth, dbHealthMiddleware } = require("./dbCheck");

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get("/health", async (req, res) => {
  try {
    const { pool } = require("./db");
    await pool.query("SELECT 1");
    res.status(200).json({
      status: "healthy",
      database: "connected",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: "unhealthy",
      database: "disconnected",
      error: error.message,
    });
  }
});

// Routes
app.use("/", complaintRoutes);
app.use("/", studentRoutes);
app.use("/", wardenRoutes);
app.use("/", userRoutes);

// Start server only after database health check passes
async function startServer() {
  try {
    // Check database connection and tables before starting
    await checkDatabaseHealth();

    app.listen(3000, () => {
      console.log("🚀 Application is running on port 3000");
      console.log("📍 Health check: http://localhost:3000/health");
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

startServer();
