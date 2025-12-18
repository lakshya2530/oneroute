const express = require("express");
const router = express.Router();
const pool = require("../../db/connection.js");

router.get("/list", async (req, res) => {
  try {
    const { status } = req.query;

    const conn = await pool.getConnection();

    // Join tickets + users + replies
    let query = `
      SELECT
        t.id AS t_id,
        t.*,
        u.*,
        tr.id AS reply_id,
        tr.ticket_id AS reply_ticket_id,
        tr.message AS reply_message,
        tr.created_at AS reply_created_at
      FROM tickets t
      LEFT JOIN users u ON t.created_by = u.id
      LEFT JOIN ticket_replies tr ON tr.ticket_id = t.id
      WHERE 1 = 1
    `;

    const params = [];

    if (status) {
      query += " AND t.status = ?";
      params.push(status);
    }

    // Order by ticket, then reply time
    query += " ORDER BY t.id DESC, tr.created_at ASC";

    const [rows] = await conn.query(query, params);
    conn.release();

    // Group rows by ticket id
    const ticketMap = new Map();

    for (const r of rows) {
      const ticketId = r.t_id;

      // Build user object
      const user = {
        id: r.user_id,
        email: r.email,
        phone: r.phone,
        username: r.username,
        first_name: r.first_name,
        last_name: r.last_name,
        gender: r.gender ?? null,
        address: r.address ?? null,
        city: r.city ?? null,
        verified: r.verified ?? 1,
        profile_completed: r.profile_completed ?? 0,
        fullname: r.fullname ?? null,
        dob: r.dob ?? null,
        occupation: r.occupation ?? null,
        state: r.state ?? null,
        gov_id_number: r.gov_id_number ?? null,
        offer_ride: r.offer_ride ?? 0,
        profile_pic: r.profile_pic ?? null,
        gov_id_image: r.gov_id_image ?? null,
        account_active: r.account_active ?? 1,
      };

      // If ticket not yet in map, initialize it
      if (!ticketMap.has(ticketId)) {
        const ticket = {
          ...r,
          t_id: r.t_id,
          user,
          replies: [],
        };

        // remove duplicated keys that belong to user or reply
        delete ticket.user_id;
        delete ticket.ticket_id;
        delete ticket.reply_id;
        delete ticket.reply_ticket_id;
        delete ticket.reply_message;
        delete ticket.reply_created_at;

        ticketMap.set(ticketId, ticket);
      }

      // Add reply if exists
      if (r.reply_id) {
        const ticket = ticketMap.get(ticketId);

        ticket.replies.push({
          id: r.reply_id,
          ticket_id: r.reply_ticket_id,
          message: r.reply_message,
          created_at: r.reply_created_at,
        });
      }
    }

    const formatted = Array.from(ticketMap.values());

    return res.json({
      success: true,
      total: formatted.length,
      data: formatted,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      msg: "Failed to fetch tickets",
      error: err.message,
    });
  }
});

router.put("/status/:id", async (req, res) => {
  try {
    const ticketId = req.params.id;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Status is required",
      });
    }

    const conn = await pool.getConnection();

    // Step 1: Update status
    const [updateResult] = await conn.query(
      `UPDATE tickets SET status = ? WHERE id = ?`,
      [status, ticketId]
    );

    if (updateResult.affectedRows === 0) {
      conn.release();
      return res.status(404).json({
        success: false,
        message: "Ticket not found",
      });
    }

    // Step 2: Fetch updated ticket with user details
    const [rows] = await conn.query(
      `
      SELECT t.*, u.*
      FROM tickets t
      LEFT JOIN users u ON t.created_by = u.id
      WHERE t.id = ?
      `,
      [ticketId]
    );

    conn.release();

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found after update",
      });
    }

    const r = rows[0];

    // Build user object (same structure as list API)
    const user = {
      id: r["u.id"] || r.id,
      email: r.email,
      phone: r.phone,
      username: r.username,
      first_name: r.first_name,
      last_name: r.last_name,

      gender: r.gender ?? null,
      address: r.address ?? null,
      city: r.city ?? null,
      verified: r.verified ?? 1,
      profile_completed: r.profile_completed ?? 0,
      fullname: r.fullname ?? null,
      dob: r.dob ?? null,
      occupation: r.occupation ?? null,
      state: r.state ?? null,
      gov_id_number: r.gov_id_number ?? null,
      offer_ride: r.offer_ride ?? 0,
      profile_pic: r.profile_pic ?? null,
      gov_id_image: r.gov_id_image ?? null,
      account_active: r.account_active ?? 1,
    };

    // Remove user fields from ticket data
    const ticket = {};
    for (const key in r) {
      if (!Object.keys(user).includes(key)) {
        ticket[key] = r[key];
      }
    }

    return res.json({
      success: true,
      message: "Ticket status updated successfully",
      data: { ...ticket, user },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      msg: "Failed to update ticket status",
      error: err.message,
    });
  }
});

router.post("/:id/replies", async (req, res) => {
  try {
    const ticketId = req.params.id;
    const { message } = req.body;

    // 2) Validate body
    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: "Message is required",
      });
    }

    const conn = await pool.getConnection();

    // 3) Ensure ticket exists
    const [ticketRows] = await conn.query(
      "SELECT id FROM tickets WHERE id = ?",
      [ticketId]
    );
    if (ticketRows.length === 0) {
      conn.release();
      return res.status(404).json({
        success: false,
        message: "Ticket not found",
      });
    }

    // 4) Insert reply
    const [insertResult] = await conn.query(
      `
      INSERT INTO ticket_replies (ticket_id, message, created_at)
      VALUES (?, ?, NOW())
      `,
      [ticketId, message.trim()]
    );

    conn.release();

    return res.status(201).json({
      success: true,
      message: "Reply added successfully",
      data: {
        id: insertResult.insertId,
        ticket_id: Number(ticketId),
        message: message.trim(),
        created_at: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Failed to add reply",
      error: err.message,
    });
  }
});

module.exports = router;
