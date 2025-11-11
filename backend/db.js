require("dotenv").config();
const Pool = require("pg").Pool;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

pool.on("error", (error, client) => {
  console.error("Database error:", error);
});

// Test connection
pool.on("connect", () => {
  console.log("Connected to Neon database");
});

module.exports = {
  pool,
};
