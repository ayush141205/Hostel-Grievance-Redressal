const db = require("../db");
const { jwtDecoder } = require("../utils/jwtToken");

// ========================
// Decode user from token
// ========================
const decodeUser = async (token) => {
  try {
    const decodedToken = jwtDecoder(token);
    const { user_id, type } = decodedToken.user;
    let userInfo;

    // ---- STUDENT ----
    if (type === "student") {
      const result = await db.pool.query(
        `SELECT student_id, room, block_id FROM student WHERE student_id = $1`,
        [user_id]
      );

      if (result.rows.length === 0) {
        console.warn(
          `⚠️ No student record found for user_id ${user_id}. Creating one...`
        );

        // Ensure at least one block exists
        const blockRes = await db.pool.query(`
          INSERT INTO block (block_name)
          VALUES ('Default Block')
          ON CONFLICT DO NOTHING
          RETURNING block_id
        `);

        const block_id =
          blockRes.rows.length > 0
            ? blockRes.rows[0].block_id
            : (await db.pool.query("SELECT block_id FROM block LIMIT 1"))
                .rows[0].block_id;

        // Create missing student record
        const insertRes = await db.pool.query(
          `INSERT INTO student (student_id, room, block_id)
           VALUES ($1, $2, $3)
           RETURNING student_id, room, block_id`,
          [user_id, "Unassigned", block_id]
        );
        userInfo = insertRes.rows[0];
        console.log(`✅ Created missing student record for user_id ${user_id}`);
      } else {
        userInfo = result.rows[0];
      }
    }

    // ---- WARDEN ----
    if (type === "warden") {
      const result = await db.pool.query(
        `SELECT warden_id, block_id FROM warden WHERE warden_id = $1`,
        [user_id]
      );

      if (result.rows.length === 0) {
        console.warn(
          `⚠️ No warden record found for user_id ${user_id}. Creating one...`
        );

        // Ensure at least one block exists
        const blockRes = await db.pool.query(`
          INSERT INTO block (block_name)
          VALUES ('Default Block')
          ON CONFLICT DO NOTHING
          RETURNING block_id
        `);

        const block_id =
          blockRes.rows.length > 0
            ? blockRes.rows[0].block_id
            : (await db.pool.query("SELECT block_id FROM block LIMIT 1"))
                .rows[0].block_id;

        // Create missing warden record
        const insertRes = await db.pool.query(
          `INSERT INTO warden (warden_id, block_id)
           VALUES ($1, $2)
           RETURNING warden_id, block_id`,
          [user_id, block_id]
        );
        userInfo = insertRes.rows[0];
        console.log(`✅ Created missing warden record for user_id ${user_id}`);
      } else {
        userInfo = result.rows[0];
      }
    }

    return userInfo;
  } catch (err) {
    console.error("decodeUser() error:", err.message);
  }
};

// ========================
// Post a complaint
// ========================
const postComplaints = async (req, res) => {
  try {
    const token = req.headers.authorization;
    const userInfo = await decodeUser(token);

    if (!userInfo) {
      return res
        .status(400)
        .json({ error: "Unable to resolve user information." });
    }

    const { student_id, block_id } = userInfo;
    const { name, description, room } = req.body;

    const query = `
      INSERT INTO complaint 
      (name, block_id, student_id, description, room, is_completed, created_at, assigned_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const newComplaint = await db.pool.query(query, [
      name,
      block_id,
      student_id,
      description,
      room,
      false,
      new Date().toISOString(),
      null,
    ]);

    res.json(newComplaint.rows[0]);
  } catch (err) {
    console.error("postComplaints error:", err.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// ========================
// Toggle complaint status (warden only)
// ========================
const putComplaintsByid = async (req, res) => {
  try {
    const token = req.headers.authorization;
    const decodedToken = jwtDecoder(token);
    const { type } = decodedToken.user;
    const { id } = req.params;

    if (type === "warden") {
      const result = await db.pool.query(
        "UPDATE complaint SET is_completed = NOT is_completed, assigned_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *",
        [id]
      );
      res.json(result.rows[0]);
    } else {
      res.status(403).json({ error: "Unauthorized" });
    }
  } catch (err) {
    console.error("putComplaintsByid error:", err.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// ========================
// Get complaints (warden = all, student = own)
// ========================
const getAllComplaintsByUser = async (req, res) => {
  try {
    const token = req.headers.authorization;
    const decodedToken = jwtDecoder(token);
    const { user_id, type } = decodedToken.user;

    if (type === "warden") {
      const allComplaints = await db.pool.query(
        "SELECT * FROM complaint ORDER BY created_at DESC"
      );
      res.json(allComplaints.rows);
    } else if (type === "student") {
      const myComplaints = await db.pool.query(
        "SELECT * FROM complaint WHERE student_id = $1 ORDER BY created_at DESC",
        [user_id]
      );
      res.json(myComplaints.rows);
    } else {
      res.status(403).json({ error: "Unauthorized" });
    }
  } catch (err) {
    console.error("getAllComplaintsByUser error:", err.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// ========================
// Get user type
// ========================
const getUserType = async (req, res) => {
  try {
    const token = req.headers.authorization;
    const decodedToken = jwtDecoder(token);
    const { type } = decodedToken.user;

    res.json({ userType: type });
  } catch (err) {
    console.error("getUserType error:", err.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// ========================
// Get user details
// ========================
const getUserDetails = async (req, res) => {
  try {
    const token = req.headers.authorization;
    const decodedToken = jwtDecoder(token);
    const { user_id, type } = decodedToken.user;

    if (type === "student") {
      const studentDetails = await db.pool.query(
        `SELECT u.full_name, u.email, u.phone, s.usn, b.block_id, b.block_name, s.room
         FROM users u
         JOIN student s ON u.user_id = s.student_id
         JOIN block b ON s.block_id = b.block_id
         WHERE u.user_id = $1`,
        [user_id]
      );
      res.json(studentDetails.rows);
    } else if (type === "warden") {
      const wardenDetails = await db.pool.query(
        `SELECT u.full_name, u.email, u.phone
         FROM users u
         WHERE u.user_id = $1`,
        [user_id]
      );
      res.json(wardenDetails.rows);
    } else {
      res.status(403).json({ error: "Unauthorized" });
    }
  } catch (err) {
    console.error("getUserDetails error:", err.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// ========================
// Delete complaint (warden only)
// ========================
const deleteComplaints = async (req, res) => {
  try {
    const token = req.headers.authorization;
    const decodedToken = jwtDecoder(token);
    const { type } = decodedToken.user;
    const { id } = req.params;

    if (type === "warden") {
      await db.pool.query(`DELETE FROM complaint WHERE id = $1`, [id]);
      res.json({ message: "Complaint deleted" });
    } else {
      res.status(403).json({ error: "Unauthorized" });
    }
  } catch (err) {
    console.error("deleteComplaints error:", err.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// ========================
// Exports
// ========================
module.exports = {
  postComplaints,
  putComplaintsByid,
  getAllComplaintsByUser,
  getUserType,
  getUserDetails,
  deleteComplaints,
};
