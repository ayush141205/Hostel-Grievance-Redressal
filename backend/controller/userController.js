const express = require("express");
const cors = require("cors");
const app = express();
const db = require("../db");
const bcrypt = require("bcrypt");
const { jwtGenerator, jwtDecoder } = require("../utils/jwtToken");
app.use(cors());
app.use(express.json());

exports.userRegister = async (req, res) => {
  const { full_name, email, phone, password, type } = req.body;
  const client = await db.pool.connect(); // Get a client for transaction

  // --- DEBUG LOG ---
  console.log(`[Register] Attempting to register user with email: ${email}`);

  try {
    // Start transaction
    await client.query("BEGIN");

    // Check if user already exists
    const user = await client.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);

    if (user.rows.length > 0) {
      await client.query("ROLLBACK");

      // --- DEBUG LOG ---
      console.warn(
        `[Register] FAILED: User already exists. Found user data:`,
        user.rows[0]
      );

      return res.status(401).json({ error: "User already exists!" });
    }

    // Validate required fields
    if (!full_name || !email || !phone || !password || !type) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "All fields are required" });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const bcryptPassword = await bcrypt.hash(password, salt);

    // Insert user
    let newUser = await client.query(
      "INSERT INTO users (full_name, email, phone, password, type) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [full_name, email, phone, bcryptPassword, type]
    );

    const userId = newUser.rows[0].user_id;

    // Insert type-specific record
    if (type === "student") {
      const { block_id, usn, room } = req.body;

      if (!block_id || !usn || !room) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error: "Student registration requires: block_id, usn, and room",
        });
      }

      // Verify block exists
      const blockExists = await client.query(
        "SELECT block_id FROM block WHERE block_id = $1",
        [block_id]
      );

      if (blockExists.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error: `Block with id ${block_id} does not exist`,
        });
      }

      await client.query(
        "INSERT INTO student (student_id, block_id, usn, room) VALUES ($1, $2, $3, $4)",
        [userId, block_id, usn, room]
      );

      console.log(`✅ Student record created for user_id: ${userId}`);
    } else if (type === "warden") {
      const { block_id } = req.body;

      if (!block_id) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error: "Warden registration requires: block_id",
        });
      }

      // Verify block exists
      const blockExists = await client.query(
        "SELECT block_id FROM block WHERE block_id = $1",
        [block_id]
      );

      if (blockExists.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error: `Block with id ${block_id} does not exist`,
        });
      }

      await client.query(
        "INSERT INTO warden (warden_id, block_id) VALUES ($1, $2)",
        [userId, block_id]
      );

      console.log(`✅ Warden record created for user_id: ${userId}`);
    } else {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: "Invalid user type. Must be 'student' or 'warden'",
      });
    }

    // Commit transaction
    await client.query("COMMIT");

    const jwtToken = jwtGenerator(userId, type);
    console.log("Registration successful:", jwtDecoder(jwtToken));

    return res.status(201).json({
      jwtToken,
      message: "Registration successful",
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Registration error:", err.message);
    res.status(500).json({
      error: "Server error during registration",
      message: err.message,
    });
  } finally {
    client.release();
  }
};

exports.userLogin = async (req, res) => {
  const { email, password } = req.body;

  try {
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    // --- DEBUG LOG ---
    console.log(`[Login] Attempting login for email: ${email}`);

    const user = await db.pool.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);

    if (user.rows.length === 0) {
      // --- DEBUG LOG ---
      console.warn(`[Login] FAILED: User not found for email: ${email}`);
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const validPassword = await bcrypt.compare(password, user.rows[0].password);

    if (!validPassword) {
      // --- DEBUG LOG ---
      console.warn(`[Login] FAILED: Invalid password for email: ${email}`);
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Verify student/warden record exists
    const userId = user.rows[0].user_id;
    const userType = user.rows[0].type;

    if (userType === "student") {
      const studentCheck = await db.pool.query(
        "SELECT * FROM student WHERE student_id = $1",
        [userId]
      );
      if (studentCheck.rows.length === 0) {
        console.error(
          `[Login] FAILED: Incomplete setup. No student record for user_id: ${userId}`
        );
        return res.status(500).json({
          error: "Account setup incomplete. Please contact administrator.",
        });
      }
    } else if (userType === "warden") {
      const wardenCheck = await db.pool.query(
        "SELECT * FROM warden WHERE warden_id = $1",
        [userId]
      );
      if (wardenCheck.rows.length === 0) {
        console.error(
          `[Login] FAILED: Incomplete setup. No warden record for user_id: ${userId}`
        );
        return res.status(500).json({
          error: "Account setup incomplete. Please contact administrator.",
        });
      }
    }

    const jwtToken = jwtGenerator(userId, userType);
    console.log("Login successful:", jwtDecoder(jwtToken));

    return res.json({ jwtToken });
  } catch (err) {
    console.error("Login error:", err.message);
    res.status(500).json({
      error: "Server error during login",
      message: err.message,
    });
  }
};
