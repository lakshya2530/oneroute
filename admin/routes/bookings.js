const express = require("express");
const router = express.Router();
const pool = require("../../db/connection.js");
const authenticateToken = require("../../middleware/auth.js");

router.get("/", async (req, res) => {
  try {
    const {
      status,
      payment_status,
      booking_id,
      user_id,
      service_id,
      start_date,
      end_date
    } = req.query;

    const conn = await pool.getConnection();

    let query = `SELECT 
  b.id AS booking_id,
  b.*,
  u.id AS user_id,
  u.*,
  s.id AS service_id,
  s.*
FROM bookings b
LEFT JOIN users u ON b.customer_id = u.id
LEFT JOIN services s ON b.service_id = s.id
WHERE 1=1
    `;

    let params = [];

    if (booking_id) {
      query += " AND b.id = ?";
      params.push(booking_id);
    }

    if (user_id) {
      query += " AND b.customer_id = ?";
      params.push(user_id);
    }

    if (service_id) {
      query += " AND b.service_id = ?";
      params.push(service_id);
    }

    if (status) {
      query += " AND b.status = ?";
      params.push(status);
    }

    if (payment_status) {
      query += " AND b.payment_status = ?";
      params.push(payment_status);
    }

    if (start_date && end_date) {
      query += " AND DATE(b.created_at) BETWEEN ? AND ?";
      params.push(start_date, end_date);
    }

    const [rows] = await conn.query(query, params);
    conn.release();

    const result = rows.map(r => {
      const user = {
  id: r["u.id"],
  username: r.username,
  phone: r.phone,
  email: r.email,

  gender: r.gender,
  address: r.address,
  city: r.city,
  verified: r.verified,
  profile_completed: r.profile_completed,
  fullname: r.fullname,
  dob: r.dob,
  occupation: r.occupation,
  state: r.state,
  gov_id_number: r.gov_id_number,
  offer_ride: r.offer_ride,
  profile_pic: r.profile_pic,
  gov_id_image: r.gov_id_image,
  created_at: r.created_at,
  updated_at: r.updated_at,
  account_active: r.account_active
};

    const service = {
  id: r["s.id"],  // Primary key
  sub_category_id: r.sub_category_id,
  service_name: r.service_name,
  service_description: r.service_description,
  price: r.price,
  approx_time: r.approx_time,
  vendor_id: r.vendor_id,
  created_at: r.created_at,
  service_type: r.service_type,
  location: r.location,
  meet_link: r.meet_link,
  icon: r.icon   
};

      const booking = {};
      for (let key in r) {
        if (!Object.keys(user).includes(key) && !Object.keys(service).includes(key)) {
          booking[key] = r[key];
        }
      }

      return { ...booking, user, service };
    });

    return res.json({
      success: true,
      data: result
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch bookings",
      error: err.message
    });
  }
});


router.put("/status/:id", async (req, res) => {
  try {
    const bookingId = req.params.id;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Status is required"
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
        message: "Booking not found"
      });
    }

    return res.json({
      success: true,
      message: "Booking status updated successfully"
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
        message: "Payment status is required"
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
        message: "Booking not found"
      });
    }

    return res.json({
      success: true,
      message: "Payment status updated successfully"
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


module.exports = router;