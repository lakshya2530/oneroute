const express = require("express");
const router = express.Router();
const pool = require("../db/connection.js");
const jwt = require("jsonwebtoken");
const upload = require("../middleware/upload.js");
const authenticateToken = require("../middleware/auth.js");

// --- Send Chat ---
router.post("/:rideId/send", authenticateToken, async (req, res) => {
  const { rideId } = req.params;
  const senderPhone = req.user.phone;
  const { receiverId, message } = req.body;
  if (!receiverId || !message) {
    return res
      .status(400)
      .json({ msg: "receiverId and message are required." });
  }
  const conn = await pool.getConnection();
  try {
    const [[sender]] = await conn.query("SELECT id FROM users WHERE phone=?", [
      senderPhone,
    ]);
    if (!sender) return res.status(404).json({ msg: "Sender not found" });
    await conn.query(
      "INSERT INTO messages (ride_id, sender_id, receiver_id, message) VALUES (?, ?, ?, ?)",
      [rideId, sender.id, receiverId, message]
    );
    res.json({ msg: "Message sent." });
  } catch (err) {
    res.status(500).json({ msg: "Failed to send message", error: err.message });
  } finally {
    conn.release();
  }
});

// Chat History
router.get("/:rideId/history", authenticateToken, async (req, res) => {
  const { rideId } = req.params;
  const userPhone = req.user.phone;
  console.log(rideId, userPhone);

  const conn = await pool.getConnection();
  try {
    const [[user]] = await conn.query("SELECT id FROM users WHERE phone=?", [
      userPhone,
    ]);
    const [history] = await conn.query(
      `SELECT * FROM messages WHERE ride_id=? AND (sender_id=? OR receiver_id=?) ORDER BY sent_at ASC`,
      [rideId, user.id, user.id]
    );
    res.json({ history });
  } catch (err) {
    res
      .status(500)
      .json({ msg: "Failed to fetch chat history", error: err.message });
  } finally {
    conn.release();
  }
});

//Users Chat List
router.get("/:rideId/users", authenticateToken, async (req, res) => {
  const { rideId } = req.params;
  const userPhone = req.user.phone;
  const conn = await pool.getConnection();
  try {
    const [[user]] = await conn.query("SELECT id FROM users WHERE phone=?", [
      userPhone,
    ]);
    if (!user) return res.status(404).json({ msg: "User not found" });

    // Fetch distinct users involved in chats for the ride, excluding the authenticated user
    const [users] = await conn.query(
      `SELECT DISTINCT u.id, u.fullname, u.phone
       FROM messages m
       JOIN users u ON (u.id = m.sender_id OR u.id = m.receiver_id)
       WHERE m.ride_id = ? AND u.id != ?`,
      [rideId, user.id]
    );

    res.json({ users });
  } catch (err) {
    res
      .status(500)
      .json({ msg: "Failed to fetch chat users", error: err.message });
  } finally {
    conn.release();
  }
});

// Mark chat as Read
router.post("/:rideId/read", authenticateToken, async (req, res) => {
  const { messageIds } = req.body;
  if (!messageIds || !Array.isArray(messageIds)) {
    return res.status(400).json({ msg: "messageIds array required" });
  }
  const conn = await pool.getConnection();
  try {
    await conn.query("UPDATE messages SET is_read = 1 WHERE id IN (?)", [
      messageIds,
    ]);
    res.json({ msg: "Messages marked as read." });
  } catch (err) {
    res
      .status(500)
      .json({ msg: "Failed to update read status", error: err.message });
  } finally {
    conn.release();
  }
});

// All Users the Logged-in User Has Chatted With (with latest ride_id)
router.get("/chat-users", authenticateToken, async (req, res) => {
  const userPhone = req.user.phone;
  const conn = await pool.getConnection();
  try {
    const [[user]] = await conn.query("SELECT id FROM users WHERE phone = ?", [
      userPhone,
    ]);
    if (!user) return res.status(404).json({ msg: "User not found" });

    const [users] = await conn.query(
      `
      SELECT DISTINCT u.id, u.fullname, u.phone,
             (
               SELECT m2.ride_id 
               FROM messages m2 
               WHERE (
                 (m2.sender_id = ? AND m2.receiver_id = u.id)
                 OR
                 (m2.receiver_id = ? AND m2.sender_id = u.id)
               )
               ORDER BY m2.sent_at DESC 
               LIMIT 1
             ) AS ride_id
      FROM users u
      JOIN messages m 
        ON (
          (m.sender_id = ? AND m.receiver_id = u.id)
          OR 
          (m.receiver_id = ? AND m.sender_id = u.id)
        )
      WHERE u.id != ?
      ORDER BY u.fullname ASC
      `,
      [user.id, user.id, user.id, user.id, user.id]
    );

    res.json({ users });
  } catch (err) {
    console.error("Error fetching chat users:", err);
    res
      .status(500)
      .json({ msg: "Failed to fetch chat users", error: err.message });
  } finally {
    conn.release();
  }
});

module.exports = router;
