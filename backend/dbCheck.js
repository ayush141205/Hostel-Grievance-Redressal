const { pool } = require("./db");

// Required tables based on your schema
const REQUIRED_TABLES = ["users", "block", "student", "warden", "complaint"];

/**
 * Check database connection and verify all required tables exist
 */
async function checkDatabaseHealth() {
  try {
    console.log("🔍 Checking database connection...");

    // Test basic connection
    const connectionTest = await pool.query("SELECT NOW() as current_time");
    console.log("✅ Database connected successfully");
    console.log(`   Time: ${connectionTest.rows[0].current_time}`);

    // Check if all required tables exist
    console.log("\n🔍 Verifying tables...");
    const tableQuery = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    const existingTables = tableQuery.rows.map((row) => row.table_name);
    const missingTables = REQUIRED_TABLES.filter(
      (table) => !existingTables.includes(table)
    );

    if (missingTables.length > 0) {
      console.error("❌ Missing tables:", missingTables.join(", "));
      console.error("   Please run your database migrations first!");
      process.exit(1);
    }

    console.log("✅ All required tables found:");
    REQUIRED_TABLES.forEach((table) => {
      console.log(`   ✓ ${table}`);
    });

    // Check table row counts
    console.log("\n📊 Table statistics:");
    for (const table of REQUIRED_TABLES) {
      const countResult = await pool.query(
        `SELECT COUNT(*) as count FROM ${table}`
      );
      console.log(`   ${table}: ${countResult.rows[0].count} rows`);
    }

    console.log("\n✅ Database health check passed!\n");
    return true;
  } catch (error) {
    console.error("❌ Database health check failed:", error.message);
    console.error("   Please check your database connection and configuration");
    console.error("\nError details:", error);
    process.exit(1);
  }
}

/**
 * Middleware to check database on each request (optional - for API health checks)
 */
async function dbHealthMiddleware(req, res, next) {
  try {
    await pool.query("SELECT 1");
    next();
  } catch (error) {
    console.error("Database connection lost:", error.message);
    res.status(503).json({
      error: "Database connection failed",
      message: "Service temporarily unavailable",
    });
  }
}

module.exports = {
  checkDatabaseHealth,
  dbHealthMiddleware,
};
