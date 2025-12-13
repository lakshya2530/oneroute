const express = require("express");
const router = express.Router();
const pool = require("../../db/connection.js");
const bcrypt = require("bcrypt");

// POST /api/admin/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log(req.body);

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password required",
      });
    }

    const conn = await pool.getConnection();
    const [rows] = await conn.query(
      "SELECT id, email, password, user_type FROM users WHERE email = ?",
      [email]
    );
    conn.release();

    const admin = rows[0];
    if (!admin || admin.user_type !== "admin") {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // password comparison
    const isMatch = await bcrypt.compare(password, admin.password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // Generate JWT token
    const jwt = require("jsonwebtoken");
    const token = jwt.sign(
      { id: admin.id, email: admin.email, role: admin.role },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: "24h" }
    );

    res.json({
      success: true,
      message: "Login successful",
      token,
      admin: { id: admin.id, email: admin.email },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Login failed",
    });
  }
});

// POST /api/admin/reset-password
router.post("/reset-password", async (req, res) => {
  try {
    const { email, newPassword } = req.body;

    if (!email || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Email and new password required",
      });
    }

    const bcrypt = require("bcrypt");
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const conn = await pool.getConnection();
    const [result] = await conn.query(
      "UPDATE users SET password = ? WHERE email = ?",
      [hashedPassword, email]
    );
    conn.release();

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Admin not found",
      });
    }

    res.json({
      success: true,
      message: "Password reset successful",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Reset failed",
    });
  }
});

module.exports = router;
