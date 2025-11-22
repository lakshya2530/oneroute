const express = require("express");
const router = express.Router();
const pool = require("../../db/connection.js");
const authenticateToken = require("../../middleware/auth.js");


router.get("/list", async (req, res) => {
  try {
    const { status } = req.query;

    const conn = await pool.getConnection();

    let query = `
      SELECT t.*, u.*
      FROM tickets t
      LEFT JOIN users u ON t.created_by = u.id
      WHERE 1 = 1
    `;

    let params = [];

    if (status) {
      query += " AND t.status = ?";
      params.push(status);
    }

    const [rows] = await conn.query(query, params);
    conn.release();

    // FORMAT RESPONSE: User inside "user" object
    const formatted = rows.map(r => {
  const user = {
    id: r["u.id"] || r.id,
    email: r.email,
    phone: r.phone,
    username: r.username,
    first_name: r.first_name,
    last_name: r.last_name,

    // Additional fields you want
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
    account_active: r.account_active ?? 1
  };

  const ticket = {};
  for (const key in r) {
    if (!Object.keys(user).includes(key)) {
      ticket[key] = r[key];
    }
  }

 return { 
    id: r.id, // This ensures ticket id is always present
    ...ticket, 
    user 
  };
});


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
      account_active: r.account_active ?? 1
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
      data: { ...ticket, user }
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



module.exports = router;
