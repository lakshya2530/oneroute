const express = require("express");
const router = express.Router();
const pool = require("../db/connection.js");
const jwt = require("jsonwebtoken");
const upload = require("../middleware/upload.js");
const authenticateToken = require("../middleware/auth.js");
const sendPushNotification = require("../utils/pushNotification");
const admin = require("../config/firebase");
const STATIC_OTP = "1234";

// --- Send OTP ---
router.post("/send-otp", async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ msg: "Phone number required" });

  try {
    const conn = await pool.getConnection();
    try {
      // Remove any existing OTP for this phone
      await conn.query("DELETE FROM otps WHERE phone = ?", [phone]);

      const expireAt = new Date(Date.now() + 5 * 60000); // 5 min expiry

      // Insert new OTP (STATIC_OTP is "1234" for testing)
      await conn.query(
        "INSERT INTO otps (phone, otp, expireAt) VALUES (?, ?, ?)",
        [phone, STATIC_OTP, expireAt]
      );

      res.json({ msg: 'OTP "1234" sent for testing.' });
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Failed to send OTP" });
  }
});

router.post("/test-push", async (req, res) => {
  try {
    const { token, title, body } = req.body;

    if (!token || !title || !body) {
      return res.status(400).json({ error: "token, title, and body are required" });
    }

    const message = {
      notification: { title, body },
      token: token, // single device token
    };

    const response = await admin.messaging().send(message);
    console.log("✅ Notification sent successfully:", response);

    res.json({
      success: true,
      message: "Notification sent successfully",
      response,
    });
  } catch (error) {
    console.error("❌ Notification error:", error);
    res.status(500).json({ error: error.message });
  }
});
// --- Verify OTP & determine next step ---
router.post("/verify-otp", async (req, res) => {
  const { phone, otp } = req.body;
  if (!phone || !otp)
    return res.status(400).json({ msg: "Phone and OTP required" });

  if (otp !== STATIC_OTP) return res.status(400).json({ msg: "Invalid OTP" });

  try {
    const conn = await pool.getConnection();
    try {
      const [otpRows] = await conn.query(
        "SELECT * FROM otps WHERE phone = ? AND otp = ? AND expireAt > NOW()",
        [phone, otp]
      );
      // if (otpRows.length === 0)
      //   return res.status(400).json({ msg: "OTP expired or not found" });

      // Remove OTP after use
      await conn.query("DELETE FROM otps WHERE phone = ?", [phone]);

      // Check if user exists
      const [userRows] = await conn.query(
        "SELECT * FROM users WHERE phone = ?",
        [phone]
      );

      if (userRows.length === 0) {
        // First-time user: create user
        await conn.query(
          "INSERT INTO users (phone, verified, profile_completed) VALUES (?, ?, ?)",
          [phone, true, false]
        );

        // Generate token for new user so they can authenticate during profile setup
        const token = jwt.sign({ phone }, process.env.JWT_SECRET, {
          expiresIn: "1d",
        });

        return res.json({
          token,
          msg: "OTP verified. Proceed to profile setup.",
        });
      } else {
        // Existing user → update verification if needed
        if (!userRows[0].verified) {
          await conn.query("UPDATE users SET verified = ? WHERE phone = ?", [
            true,
            phone,
          ]);
        }

        // Profile completed?
        if (userRows[0].profile_completed) {
          // Already complete → issue final JWT
          const token = jwt.sign({ phone }, process.env.JWT_SECRET, {
            expiresIn: "1d",
          });
          return res.json({ token, msg: "Login successful. Welcome back!" });
        } else {
          // Verified but profile incomplete → issue token and proceed to setup
          const token = jwt.sign({ phone }, process.env.JWT_SECRET, {
            expiresIn: "1d",
          });
          return res.json({
            token,
            msg: "OTP verified. Proceed to profile setup.",
          });
        }
      }
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "OTP verification failed" });
  }
});

// --- Get Profile ---
router.get("/profile", authenticateToken, async (req, res) => {
  const { phone } = req.user;
  try {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query("SELECT * FROM users WHERE phone = ?", [
        phone,
      ]);
      if (rows.length === 0)
        return res.status(404).json({ msg: "User not found" });

      const user = rows[0];
      const baseUrl =
        process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;

      // Attach full URLs to file fields
      user.profile_pic = user.profile_pic
        ? `${baseUrl}/${user.profile_pic.replace(/\\/g, "/")}`
        : null;
      user.gov_id_image = user.gov_id_image
        ? `${baseUrl}/${user.gov_id_image.replace(/\\/g, "/")}`
        : null;

      res.json({ user });
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Failed to fetch profile" });
  }
});

// --- Update Profile ---
router.put(
  "/update/profile",
  upload.fields([
    { name: "profile_pic", maxCount: 1 },
    { name: "gov_id_image", maxCount: 1 },
  ]),
  authenticateToken,
  async (req, res) => {
    const { phone } = req.user;
    try {
      const {
        fullname,
        dob,
        gender,
        occupation,
        address,
        city,
        state,
        gov_id_number,
      } = req.body;

      const conn = await pool.getConnection();
      try {
        const [updateResult] = await conn.query(
          `UPDATE users SET fullname=?, dob=?, gender=?, occupation=?, address=?, city=?, state=?, gov_id_number=?, 
           profile_pic=?, gov_id_image=? WHERE phone=?`,
          [
            fullname,
            dob,
            gender,
            occupation,
            address,
            city,
            state,
            gov_id_number,
            req.files["profile_pic"]?.[0]?.path || null,
            req.files["gov_id_image"]?.[0]?.path || null,
            phone,
          ]
        );

        if (updateResult.affectedRows === 0) {
          return res.status(404).json({ msg: "User not found" });
        }

        const [userRows] = await conn.query(
          "SELECT * FROM users WHERE phone=?",
          [phone]
        );
        const updatedUser = userRows[0];

        res.json({ user: updatedUser, msg: "Profile updated successfully" });
      } finally {
        conn.release();
      }
    } catch (err) {
      console.error(err);
      res.status(500).json({ msg: "Profile update failed" });
    }
  }
);

// --- Delete User Account ---
router.delete("/delete-account", authenticateToken, async (req, res) => {
  const { phone } = req.user;
  const conn = await pool.getConnection();
  try {
    const [result] = await conn.query(
      "UPDATE users SET account_active = 0 WHERE phone = ? AND account_active = 1",
      [phone]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ msg: "User not found or already deleted" });
    }

    res.json({ msg: "User account deleted successfully" });
  } catch (err) {
    res
      .status(500)
      .json({ msg: "Failed to delete user account", error: err.message });
  } finally {
    conn.release();
  }
});

module.exports = router;
