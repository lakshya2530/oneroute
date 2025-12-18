const express = require("express");
const router = express.Router();
const pool = require("../db/connection.js");
const authenticateToken = require("../middleware/auth.js");

// POST /api/user/tickets  (user creates ticket)
router.post("/tickets", authenticateToken, async (req, res) => {
  const { phone } = req.user;
  const { title, description } = req.body;

  if (!title || !description) {
    return res.status(400).json({
      success: false,
      message: "Title and description are required",
    });
  }

  const conn = await pool.getConnection();
  try {
    // 1) Get current user
    const user = await getCurrentUser(conn, phone);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // 2) Generate a simple ticket_id string (optional)
    const ticketIdStr = `T-${Date.now()}`;

    // 3) Insert ticket
    const [result] = await conn.query(
      `
      INSERT INTO tickets (ticket_id, title, description, status, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, NOW(), NOW())
      `,
      [ticketIdStr, title, description, "open", user.id]
    );

    return res.status(201).json({
      success: true,
      message: "Ticket created successfully",
      data: {
        id: result.insertId,
        ticket_id: ticketIdStr,
        title,
        description,
        status: "open",
        created_by: user.id,
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
});


// GET /api/user/tickets  (tickets created by this user)
router.get("/tickets", authenticateToken, async (req, res) => {
  const { phone } = req.user;

  const conn = await pool.getConnection();
  try {
    // 1) Get current user
    const user = await getCurrentUser(conn, phone);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // 2) Get tickets + replies for this user
    const [rows] = await conn.query(
      `
      SELECT
        t.id AS t_id,
        t.ticket_id,
        t.title,
        t.description,
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

    for (const r of rows) {
      const tid = r.t_id;

      if (!ticketMap.has(tid)) {
        ticketMap.set(tid, {
          id: r.t_id,
          ticket_id: r.ticket_id,
          title: r.title,
          description: r.description,
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
