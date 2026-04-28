const express = require("express");
const router = express.Router();
const {pool} = require("../db/connection.js");
const authenticateToken = require("../middleware/auth.js");
const upload = require("../middleware/upload.js");

// POST /api/user/tickets  (user creates ticket)
router.post(
  "/raise",
  authenticateToken,
  upload.single("image"),
  async (req, res) => {
    const { phone } = req.user;
    const { title, description } = req.body;

    // 🔹 Basic validation
    if (!title || !description) {
      return res.status(400).json({
        success: false,
        message: "Title and description are required",
      });
    }

    // 🔹 Minimum 50 characters validation
    if (description.trim().length < 50) {
      return res.status(400).json({
        success: false,
        message: "Description must be at least 50 characters long",
      });
    }

    const conn = await pool.getConnection();

    try {
      // 1️⃣ Get user
      const [[user]] = await conn.query("SELECT * FROM users WHERE phone=?", [
        phone,
      ]);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      const ticketIdStr = `T-${Date.now()}`;

      // 2️⃣ Insert ticket with image
      const [result] = await conn.query(
        `
        INSERT INTO tickets 
        (ticket_id, title, description, image, status, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
        `,
        [
          ticketIdStr,
          title,
          description,
          req.file ? req.file.path : null,
          "open",
          user.id,
        ]
      );

      return res.status(201).json({
        success: true,
        message: "Ticket created successfully",
        data: {
          id: result.insertId,
          ticket_id: ticketIdStr,
          title,
          description,
          image: req.file ? req.file.path : null,
          status: "open",
        },
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({
        success: false,
        message: "Failed to create ticket",
        error: err.message,
      });
    } finally {
      conn.release();
    }
  }
);

// GET /api/user/tickets  (tickets created by this user)
router.get("/", authenticateToken, async (req, res) => {
  const { phone } = req.user;

  const conn = await pool.getConnection();
  try {
    // 1) Get current user
    const [[user]] = await conn.query("SELECT * FROM users WHERE phone=?", [
      phone,
    ]);
    if (!user) return res.status(404).json({ msg: "User not found" });

    // 2) Get tickets + replies for this user
    const [rows] = await conn.query(
      `
      SELECT
        t.id AS t_id,
        t.ticket_id,
        t.title,
        t.description,
        t.image,
        t.status,
        t.created_at,
        t.updated_at,
        tr.id AS reply_id,
        tr.message AS reply_message,
        tr.created_at AS reply_created_at
      FROM tickets t
      LEFT JOIN ticket_replies tr ON tr.ticket_id = t.id
      WHERE t.created_by = ?
      ORDER BY t.id DESC, tr.created_at ASC
      `,
      [user.id]
    );

    // 3) Group tickets with replies
    const ticketMap = new Map();
    const baseUrl =
      process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;

    for (const r of rows) {
      const tid = r.t_id;

      if (!ticketMap.has(tid)) {
        ticketMap.set(tid, {
          id: r.t_id,
          ticket_id: r.ticket_id,
          title: r.title,
          description: r.description,
          image: r.image ? `${baseUrl}/${r.image}` : null,
          status: r.status,
          created_at: r.created_at,
          updated_at: r.updated_at,
          replies: [],
        });
      }

      if (r.reply_id) {
        const ticket = ticketMap.get(tid);
        ticket.replies.push({
          id: r.reply_id,
          message: r.reply_message,
          created_at: r.reply_created_at,
        });
      }
    }

    const data = Array.from(ticketMap.values());

    return res.json({
      success: true,
      total: data.length,
      data,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch tickets",
      error: err.message,
    });
  } finally {
    conn.release();
  }
});

// DELETE /api/user/tickets/:id  (delete specific ticket)
router.delete("/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { phone } = req.user;
  console.log;

  const conn = await pool.getConnection();
  try {
    // 1) Verify ticket belongs to user and exists
    const [[ticket]] = await conn.query(
      "SELECT id FROM tickets WHERE id = ? AND created_by = (SELECT id FROM users WHERE phone = ?)",
      [id, phone]
    );

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found or access denied",
      });
    }

    // 2) Delete ticket replies first (foreign key constraint)
    await conn.query("DELETE FROM ticket_replies WHERE ticket_id = ?", [id]);

    // 3) Delete the ticket
    await conn.query("DELETE FROM tickets WHERE id = ?", [id]);

    return res.json({
      success: true,
      message: "Ticket deleted successfully",
      deleted_id: id,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Failed to delete ticket",
      error: err.message,
    });
  } finally {
    conn.release();
  }
});

module.exports = router;
