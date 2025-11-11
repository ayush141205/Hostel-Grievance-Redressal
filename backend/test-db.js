const { pool } = require("./db");

async function testConnection() {
  try {
    const result = await pool.query("SELECT NOW() as current_time");
    console.log("✅ Successfully connected to Neon!");
    console.log("Current time:", result.rows[0].current_time);

    // Test if tables exist
    const tables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);

    console.log("\n📋 Tables in database:");
    tables.rows.forEach((row) => {
      console.log("  -", row.table_name);
    });
  } catch (error) {
    console.error("❌ Connection error:", error.message);
  } finally {
    await pool.end();
  }
}

testConnection();
