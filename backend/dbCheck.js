const fs = require("fs");
const path = require("path");
const db = require("./db");

async function checkDatabaseHealth() {
  console.log("🚀 Connecting to database...");
  const sqlPath = path.join(__dirname, "database.sql");

  if (!fs.existsSync(sqlPath)) {
    console.error("❌ database.sql not found in project directory.");
    throw new Error("database.sql missing");
  }

  const sql = fs.readFileSync(sqlPath, "utf8");
  console.log("📄 Executing database.sql...");
  await db.pool.query(sql);

  console.log("✅ Database initialized successfully!");
  return true;
}

module.exports = { checkDatabaseHealth };
