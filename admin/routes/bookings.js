const express = require("express");
const router = express.Router();
const pool = require("../../db/connection.js");
const authenticateToken = require("../../middleware/auth.js");

router.put("/status/:id", async (req, res) => {
  try {
    const bookingId = req.params.id;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Status is required",
      });
    }

    const conn = await pool.getConnection();

    const [result] = await conn.query(
      `UPDATE bookings SET status = ? WHERE id = ?`,
      [status, bookingId]
    );

    conn.release();

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    return res.json({
      success: true,
      message: "Booking status updated successfully",
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Failed to update status",
      error: err.message,
    });
  }
});

router.put("/payment-status/:id", async (req, res) => {
  try {
    const bookingId = req.params.id;
    const { payment_status } = req.body;

    if (!payment_status) {
      return res.status(400).json({
        success: false,
        message: "Payment status is required",
      });
    }

    const conn = await pool.getConnection();

    const [result] = await conn.query(
      `UPDATE bookings SET payment_status = ? WHERE id = ?`,
      [payment_status, bookingId]
    );

    conn.release();

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    return res.json({
      success: true,
      message: "Payment status updated successfully",
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Failed to update payment status",
      error: err.message,
    });
  }
});

// GET All Requested Rides -- (accepted, completed, rejected, cancelled)
router.get("/", async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    const conn = await pool.getConnection();
    // Base query
    let query = `
      SELECT 
        id,
        ride_id,
        passenger_id,
        pickup_stop,
        no_of_seats,
        estimated_amount,
        message,
        status,
        created_at,
        pickup_stop_lat,
        pickup_stop_lng,
        owner_id
      FROM ride_requests
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `;

    let countQuery = `
      SELECT COUNT(*) AS total
      FROM ride_requests
    `;

    const pageNum = Number(page) || 1;
    const limitNum = Number(limit) || 10;
    const offset = (pageNum - 1) * limitNum;

    const params = [limitNum, offset];

    // total count
    const [countRows] = await conn.query(countQuery);
    const total = countRows?.[0]?.total ?? 0;
    const totalPages = Math.ceil(total / limitNum) || 1;

    // data
    const [rows] = await conn.query(query, params);
    conn.release();
    console.log(rows);
    return res.json({
      success: true,
      data: rows,
      pagination: {
        current_page: pageNum,
        total_pages: totalPages,
        total_items: total,
        items_per_page: limitNum,
        has_next: pageNum < totalPages,
        has_prev: pageNum > 1,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch ride_requests",
      error: err.message,
    });
  }
});

module.exports = router;
