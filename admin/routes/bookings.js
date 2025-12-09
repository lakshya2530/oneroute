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
    const { page = 1, limit = 10, status } = req.query;

    const conn = await pool.getConnection();

    let query = `
      SELECT 
        rr.id,
        rr.ride_id,
        rr.passenger_id,
        rr.pickup_stop,
        rr.no_of_seats,
        rr.estimated_amount,
        rr.message,
        rr.status,
        rr.created_at,
        rr.pickup_stop_lat,
        rr.pickup_stop_lng,
        rr.owner_id,

        -- passenger details
        u.fullname AS passenger_name,
        u.gender AS passenger_gender,
        u.phone AS passenger_phone,
        u.city AS passenger_city,
        u.state AS passenger_state,
        u.profile_pic AS passenger_profile_pic,

        -- ride details
        r.pickup_location,
        r.pickup_lat,
        r.pickup_lng,
        r.drop_location,
        r.drop_lat,
        r.drop_lng,
        r.ride_date,
        r.ride_time,
        r.seats_available,
        r.amount_per_seat,
        r.pickup_note,
        r.ride_status,

        -- vehicle details (owner)
        v.vehicle_make,
        v.vehicle_model,
        v.vehicle_year,
        v.license_plate,
        v.vehicle_image

      FROM ride_requests rr
      LEFT JOIN users u ON rr.passenger_id = u.id
      LEFT JOIN rides r ON rr.ride_id = r.id
      LEFT JOIN vehicles v ON v.user_id = rr.owner_id
    `;

    let countQuery = `
      SELECT COUNT(*) AS total
      FROM ride_requests rr
      LEFT JOIN users u ON rr.passenger_id = u.id
      LEFT JOIN rides r ON rr.ride_id = r.id
      LEFT JOIN vehicles v ON v.user_id = rr.owner_id
    `;

    const conditions = [];
    const params = [];

    // Status filter
    if (status) {
      conditions.push("rr.status = ?");
      params.push(status);
    }

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
      countQuery += " WHERE " + conditions.join(" AND ");
    }

    query += " ORDER BY rr.created_at DESC LIMIT ? OFFSET ?";

    const pageNum = Number(page);
    const limitNum = Number(limit);
    const offset = (pageNum - 1) * limitNum;

    params.push(limitNum, offset);

    // Count query params
    const countParams = conditions.length ? params.slice(0, -2) : [];

    const [countRows] = await conn.query(countQuery, countParams);
    const total = countRows[0]?.total || 0;
    const totalPages = Math.ceil(total / limitNum) || 1;

    const [rows] = await conn.query(query, params);

    conn.release();

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
      message: "Failed to fetch ride requests with user + ride + vehicle details",
      error: err.message,
    });
  }
});


module.exports = router;
