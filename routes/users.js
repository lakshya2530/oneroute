const express = require("express");
const router = express.Router();
const pool = require("../db/connection.js");
const jwt = require("jsonwebtoken");
const upload = require("../middleware/upload.js");
const authenticateToken = require("../middleware/auth.js");
const sendPushNotification = require("../utils/pushNotification.js");
const admin = require("../config/firebase.js");
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
      return res
        .status(400)
        .json({ error: "token, title, and body are required" });
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

// FCM Token API
router.post("/fcm-token", authenticateToken, async (req, res) => {
  const { fcm_token } = req.body;
  const { phone } = req.user;
  const conn = await pool.getConnection();

  try {
    await conn.query("UPDATE users SET fcm_token = ? WHERE phone = ?", [
      fcm_token,
      phone,
    ]);
    res.json({ success: true, msg: "Token saved" });
  } catch (err) {
    res.status(500).json({ msg: "Failed to save token", error: err.message });
  } finally {
    conn.release();
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

// create new contact
router.post("/emergency-contacts", authenticateToken, async (req, res) => {
  const { phone } = req.user;
  const contactData = req.body; // Accept all body fields as-is

  const conn = await pool.getConnection();
  try {
    // Verify user exists
    const [[user]] = await conn.query("SELECT id FROM users WHERE phone = ?", [
      phone,
    ]);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // Insert contact (dynamic fields from body)
    const [result] = await conn.query("INSERT INTO emergency_contacts SET ?", {
      ...contactData,
      user_id: user.id,
    });

    const [newContact] = await conn.query(
      "SELECT * FROM emergency_contacts WHERE id = ?",
      [result.insertId]
    );

    res.json({
      success: true,
      message: "Emergency contact added",
      data: newContact[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  } finally {
    conn.release();
  }
});

// get all user contacts
router.get("/emergency-contacts", authenticateToken, async (req, res) => {
  const { phone } = req.user;

  const conn = await pool.getConnection();
  try {
    const [[user]] = await conn.query("SELECT id FROM users WHERE phone = ?", [
      phone,
    ]);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const [contacts] = await conn.query(
      "SELECT * FROM emergency_contacts WHERE user_id = ? ORDER BY created_at DESC",
      [user.id]
    );

    res.json({
      success: true,
      total: contacts.length,
      data: contacts,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  } finally {
    conn.release();
  }
});

// remove notification contact
router.delete(
  "/emergency-contacts/:id",
  authenticateToken,
  async (req, res) => {
    const { id } = req.params;
    const { phone } = req.user;

    const conn = await pool.getConnection();
    try {
      const [[user]] = await conn.query(
        "SELECT id FROM users WHERE phone = ?",
        [phone]
      );
      if (!user) {
        return res
          .status(404)
          .json({ success: false, message: "User not found" });
      }

      const [result] = await conn.query(
        "DELETE FROM emergency_contacts WHERE id = ? AND user_id = ?",
        [id, user.id]
      );

      if (result.affectedRows === 0) {
        return res
          .status(404)
          .json({ success: false, message: "Contact not found" });
      }

      res.json({
        success: true,
        message: "Emergency contact deleted",
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: err.message });
    } finally {
      conn.release();
    }
  }
);

// Users Notification
router.get("/notifications", authenticateToken, async (req, res) => {
  const { phone } = req.user;
  const { page = 1, limit = 20, read = "false" } = req.query;
  const offset = (page - 1) * limit;

  const conn = await pool.getConnection();
  try {
    const [[user]] = await conn.query("SELECT id FROM users WHERE phone = ?", [
      phone,
    ]);

    if (!user?.id) return res.status(404).json({ msg: "User not found" });

    const isRead = read === "true";

    const [notifications] = await conn.query(
      `SELECT id, title, body, data, type, is_read, created_at
       FROM notifications
       WHERE user_id = ? AND is_read = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [user.id, isRead, parseInt(limit), parseInt(offset)]
    );

    const formattedNotifications = notifications.map((n) => ({
      ...n,
      data: n.data ? JSON.parse(n.data) : null,
    }));

    const [[countResult]] = await conn.query(
      "SELECT COUNT(*) as total FROM notifications WHERE user_id = ? AND is_read = ?",
      [user.id, isRead]
    );

    const total = countResult.total;

    res.json({
      success: true,
      notifications: formattedNotifications,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      msg: "Failed to fetch notifications",
      error: err.message,
    });
  } finally {
    conn.release();
  }
});

// Mark Notification as Read
router.put("/notifications/read-all", authenticateToken, async (req, res) => {
  const { phone } = req.user;
  const { notification_ids } = req.body; // Optional: array of notification IDs

  const conn = await pool.getConnection();
  try {
    const [[user]] = await conn.query("SELECT id FROM users WHERE phone = ?", [
      phone,
    ]);
    if (!user?.id) return res.status(404).json({ msg: "User not found" });

    if (notification_ids && Array.isArray(notification_ids)) {
      // Mark notification notifications as read
      const placeholders = notification_ids.map(() => "?").join(",");
      await conn.query(
        `UPDATE notifications SET is_read = TRUE WHERE user_id = ? AND id IN (${placeholders})`,
        [user.id, ...notification_ids]
      );
      res.json({
        success: true,
        msg: `${notification_ids.length} notifications marked as read`,
      });
    } else {
      // Mark ALL unread as read
      const [result] = await conn.query(
        "UPDATE notifications SET is_read = TRUE WHERE user_id = ? AND is_read = FALSE",
        [user.id]
      );
      res.json({
        success: true,
        msg: "All notifications marked as read",
        markedCount: result.affectedRows,
      });
    }
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ msg: "Failed to update notifications", error: err.message });
  } finally {
    conn.release();
  }
});

// Raise SOS
router.post("/sos/raise", authenticateToken, async (req, res) => {
  const { latitude, longitude, bookingId, phone } = req.body;
  const { phone: senderPhone } = req.user;

  if (!latitude || !longitude || !bookingId || !phone) {
    return res.status(400).json({
      success: false,
      message: "latitude, longitude, bookingId and phone are required",
    });
  }

  const conn = await pool.getConnection();
  try {
    //Sender
    const [[sender]] = await conn.query(
      "SELECT id, phone, fullname FROM users WHERE phone = ? AND account_active = 1",
      [senderPhone]
    );

    if (!sender) {
      return res.status(404).json({
        success: false,
        message: "Sender not found",
      });
    }

    //Receiver (Emergency Contact)
    const [[receiver]] = await conn.query(
      "SELECT id, phone, fcm_token FROM users WHERE phone = ? AND account_active = 1",
      [phone]
    );

    if (!receiver) {
      return res.status(404).json({
        success: false,
        message: "Emergency contact not found",
      });
    }

    // Prevent self SOS
    if (sender.id === receiver.id) {
      return res.status(400).json({
        success: false,
        message: "You cannot send SOS to yourself",
      });
    }

    //Prevent duplicate SOS
    const [[existing]] = await conn.query(
      `SELECT id FROM sos_requests
       WHERE sender_id = ? AND booking_id = ? AND status = 'active'`,
      [sender.id, bookingId]
    );

    if (existing) {
      return res.status(409).json({
        success: false,
        message: "SOS already active for this booking",
      });
    }

    //Save SOS
    await conn.query(
      `INSERT INTO sos_requests
       (sender_id, receiver_id, sender_phone, receiver_phone, booking_id, latitude, longitude)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        sender.id,
        receiver.id,
        sender.phone,
        receiver.phone,
        bookingId,
        latitude,
        longitude,
      ]
    );

    // PUSH NOTIFICATION
    if (receiver.fcm_token) {
      await sendPushNotification(
        receiver.fcm_token,
        "🚨 Emergency SOS Alert",
        `${sender.fullname || "Your contact"} needs immediate help`,
        {
          type: "sos_alert",
          booking_id: bookingId,
          latitude: latitude,
          longitude: longitude,
          action: "view_sos",
        },
        receiver.id
      );
    }

    res.json({
      success: true,
      message: "SOS sent successfully to emergency contact",
    });
  } catch (err) {
    console.error("SOS Error:", err);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  } finally {
    conn.release();
  }
});

// Get SOS Recevied
router.get("/sos/received", authenticateToken, async (req, res) => {
  const { phone } = req.user;
  const conn = await pool.getConnection();

  try {
    const [[user]] = await conn.query("SELECT id FROM users WHERE phone = ?", [
      phone,
    ]);

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const [rows] = await conn.query(
      `SELECT s.*, u.fullname, u.profile_pic
       FROM sos_requests s
       JOIN users u ON u.id = s.sender_id
       WHERE s.receiver_id = ?
       ORDER BY s.created_at DESC`,
      [user.id]
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  } finally {
    conn.release();
  }
});

// SOS resolved
router.put("/sos/:id/resolve", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { phone } = req.user;

  const conn = await pool.getConnection();
  try {
    const [[user]] = await conn.query("SELECT id FROM users WHERE phone = ?", [
      phone,
    ]);

    const [result] = await conn.query(
      `UPDATE sos_requests
       SET status = 'resolved'
       WHERE id = ? AND receiver_id = ?`,
      [id, user.id]
    );

    if (result.affectedRows === 0) {
      return res.status(403).json({
        success: false,
        message: "Not authorized or SOS not found",
      });
    }

    res.json({
      success: true,
      message: "SOS resolved successfully",
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  } finally {
    conn.release();
  }
});

module.exports = router;
