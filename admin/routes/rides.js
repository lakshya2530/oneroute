const express = require("express");
const router = express.Router();
const pool = require("../../db/connection.js");
const authenticateToken = require("../../middleware/auth.js");

// Get all rides with optional filters
router.get("/", async (req, res) => {
  try {
    const {
      id,
      user_id,
      ride_status,
      start_date,
      end_date,
      seats_available,
      min_amount,
      max_amount,
      page = 1,
      limit = 10,
    } = req.query;

    const conn = await pool.getConnection();

    let query = `SELECT 
      r.*,
      u.*
    FROM rides r
    LEFT JOIN users u ON r.user_id = u.id
    WHERE 1=1`;

    let countQuery = `SELECT COUNT(*) as total FROM rides r WHERE 1=1`;
    let params = [];
    let countParams = [];

    // Filters
    if (id) {
      query += " AND r.id = ?";
      countQuery += " AND r.id = ?";
      params.push(id);
      countParams.push(id);
    }

    if (user_id) {
      query += " AND r.user_id = ?";
      countQuery += " AND r.user_id = ?";
      params.push(user_id);
      countParams.push(user_id);
    }

    if (ride_status) {
      query += " AND r.ride_status = ?";
      countQuery += " AND r.ride_status = ?";
      params.push(ride_status);
      countParams.push(ride_status);
    }

    // Date range filter
    if (start_date && end_date) {
      query += " AND r.ride_date BETWEEN ? AND ?";
      countQuery += " AND r.ride_date BETWEEN ? AND ?";
      params.push(start_date, end_date);
      countParams.push(start_date, end_date);
    } else if (start_date) {
      query += " AND r.ride_date >= ?";
      countQuery += " AND r.ride_date >= ?";
      params.push(start_date);
      countParams.push(start_date);
    } else if (end_date) {
      query += " AND r.ride_date <= ?";
      countQuery += " AND r.ride_date <= ?";
      params.push(end_date);
      countParams.push(end_date);
    }

    if (seats_available) {
      query += " AND r.seats_available >= ?";
      countQuery += " AND r.seats_available >= ?";
      params.push(seats_available);
      countParams.push(seats_available);
    }

    if (min_amount) {
      query += " AND r.amount_per_seat >= ?";
      countQuery += " AND r.amount_per_seat >= ?";
      params.push(min_amount);
      countParams.push(min_amount);
    }

    if (max_amount) {
      query += " AND r.amount_per_seat <= ?";
      countQuery += " AND r.amount_per_seat <= ?";
      params.push(max_amount);
      countParams.push(max_amount);
    }

    // Add pagination
    const offset = (page - 1) * limit;
    query += " ORDER BY r.created_at DESC LIMIT ? OFFSET ?";
    params.push(parseInt(limit), parseInt(offset));

    // Get total count
    const [countResult] = await conn.query(countQuery, countParams);
    const total = countResult[0].total;
    const totalPages = Math.ceil(total / limit);

    // Get rides data
    const [rows] = await conn.query(query, params);
    conn.release();

    // Format Response
    const result = rows.map((r) => {
      const user = {
        id: r.user_id,
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
        account_active: r.account_active,
      };

      const ride = {
        id: r.id,
        user_id: r.user_id,
        pickup_location: r.pickup_location,
        pickup_lat: r.pickup_lat,
        pickup_lng: r.pickup_lng,
        drop_location: r.drop_location,
        drop_lat: r.drop_lat,
        drop_lng: r.drop_lng,
        ride_date: r.ride_date,
        ride_time: r.ride_time,
        seats_available: r.seats_available,
        amount_per_seat: r.amount_per_seat,
        pickup_note: r.pickup_note,
        ride_status: r.ride_status,
        created_at: r.created_at,
      };

      return { ...ride, user };
    });

    return res.json({
      success: true,
      data: result,
      pagination: {
        current_page: parseInt(page),
        total_pages: totalPages,
        total_items: total,
        items_per_page: parseInt(limit),
        has_next: page < totalPages,
        has_prev: page > 1,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch rides",
      error: err.message,
    });
  }
});
// Get ride by ID
router.get("/:id", async (req, res) => {
  try {
    const rideId = req.params.id;
    const conn = await pool.getConnection();

    const query = `SELECT 
      r.*,
      u.id AS user_id,
      u.username,
      u.phone,
      u.email,
      u.gender,
      u.address,
      u.city,
      u.verified,
      u.profile_completed,
      u.fullname,
      u.dob,
      u.occupation,
      u.state,
      u.gov_id_number,
      u.offer_ride,
      u.profile_pic,
      u.gov_id_image,
      u.created_at AS user_created_at,
      u.updated_at AS user_updated_at,
      u.account_active,
      v.id AS vehicle_id,
      v.vehicle_make,
      v.vehicle_model,
      v.vehicle_year,
      v.license_plate,
      v.vehicle_image AS vehicle_image
    FROM rides r
    LEFT JOIN users u ON r.user_id = u.id
    LEFT JOIN vehicles v ON r.user_id = v.user_id
    WHERE r.id = ?`;

    const [rows] = await conn.query(query, [rideId]);
    conn.release();

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Ride not found",
      });
    }

    const r = rows[0];
    const user = {
      id: r.user_id,
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
      created_at: r.user_created_at,
      updated_at: r.user_updated_at,
      account_active: r.account_active,
    };

    const vehicle = r.vehicle_id
      ? {
          id: r.vehicle_id,
          vehicle_make: r.vehicle_make,
          vehicle_model: r.vehicle_model,
          vehicle_year: r.vehicle_year,
          license_plate: r.license_plate,
          vehicle_image: r.vehicle_image,
        }
      : null;

    const ride = {
      id: r.id,
      user_id: r.user_id,
      pickup_location: r.pickup_location,
      pickup_lat: r.pickup_lat,
      pickup_lng: r.pickup_lng,
      drop_location: r.drop_location,
      drop_lat: r.drop_lat,
      drop_lng: r.drop_lng,
      ride_date: r.ride_date,
      ride_time: r.ride_time,
      seats_available: r.seats_available,
      amount_per_seat: r.amount_per_seat,
      pickup_note: r.pickup_note,
      ride_status: r.ride_status,
      created_at: r.created_at,
    };

    return res.json({
      success: true,
      data: { ...ride, user, vehicle },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch ride",
      error: err.message,
    });
  }
});

// Create new ride
router.post("/", authenticateToken, async (req, res) => {
  try {
    const {
      user_id,
      pickup_location,
      pickup_lat,
      pickup_lng,
      drop_location,
      drop_lat,
      drop_lng,
      ride_date,
      ride_time,
      seats_available,
      amount_per_seat,
      pickup_note,
    } = req.body;

    // Required fields validation
    const requiredFields = [
      "user_id",
      "pickup_location",
      "pickup_lat",
      "pickup_lng",
      "drop_location",
      "drop_lat",
      "drop_lng",
      "ride_date",
      "ride_time",
      "seats_available",
      "amount_per_seat",
    ];

    const missingFields = requiredFields.filter((field) => !req.body[field]);

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(", ")}`,
      });
    }

    const conn = await pool.getConnection();

    const [result] = await conn.query(
      `INSERT INTO rides (
        user_id, pickup_location, pickup_lat, pickup_lng, 
        drop_location, drop_lat, drop_lng, ride_date, ride_time, 
        seats_available, amount_per_seat, pickup_note, ride_status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', NOW())`,
      [
        user_id,
        pickup_location,
        pickup_lat,
        pickup_lng,
        drop_location,
        drop_lat,
        drop_lng,
        ride_date,
        ride_time,
        seats_available,
        amount_per_seat,
        pickup_note || null,
      ]
    );

    conn.release();

    return res.status(201).json({
      success: true,
      message: "Ride created successfully",
      data: {
        id: result.insertId,
        user_id,
        pickup_location,
        pickup_lat,
        pickup_lng,
        drop_location,
        drop_lat,
        drop_lng,
        ride_date,
        ride_time,
        seats_available,
        amount_per_seat,
        pickup_note,
        ride_status: "open",
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Failed to create ride",
      error: err.message,
    });
  }
});

// Update ride status
router.patch("/:id/status", async (req, res) => {
  try {
    const rideId = req.params.id;
    const { ride_status } = req.body;

    if (!ride_status) {
      return res.status(400).json({
        success: false,
        message: "ride_status is required",
      });
    }

    // Validate status value
    const validStatuses = [
      "open",
      "full",
      "in_progress",
      "completed",
      "cancelled",
    ];
    if (!validStatuses.includes(ride_status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid ride_status. Must be one of: ${validStatuses.join(
          ", "
        )}`,
      });
    }

    const conn = await pool.getConnection();

    // Check if ride exists
    const [checkRows] = await conn.query("SELECT id FROM rides WHERE id = ?", [
      rideId,
    ]);

    if (checkRows.length === 0) {
      conn.release();
      return res.status(404).json({
        success: false,
        message: "Ride not found",
      });
    }

    // Update ride status
    const [result] = await conn.query(
      "UPDATE rides SET ride_status = ? WHERE id = ?",
      [ride_status, rideId]
    );

    conn.release();

    return res.json({
      success: true,
      message: "Ride status updated successfully",
      data: {
        id: rideId,
        ride_status,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Failed to update ride status",
      error: err.message,
    });
  }
});

// Update ride details
router.put("/:id", authenticateToken, async (req, res) => {
  try {
    const rideId = req.params.id;
    const {
      pickup_location,
      pickup_lat,
      pickup_lng,
      drop_location,
      drop_lat,
      drop_lng,
      ride_date,
      ride_time,
      seats_available,
      amount_per_seat,
      pickup_note,
    } = req.body;

    const conn = await pool.getConnection();

    // Check if ride exists
    const [checkRows] = await conn.query("SELECT id FROM rides WHERE id = ?", [
      rideId,
    ]);

    if (checkRows.length === 0) {
      conn.release();
      return res.status(404).json({
        success: false,
        message: "Ride not found",
      });
    }

    // Build dynamic update query
    const updateFields = [];
    const updateParams = [];

    if (pickup_location !== undefined) {
      updateFields.push("pickup_location = ?");
      updateParams.push(pickup_location);
    }
    if (pickup_lat !== undefined) {
      updateFields.push("pickup_lat = ?");
      updateParams.push(pickup_lat);
    }
    if (pickup_lng !== undefined) {
      updateFields.push("pickup_lng = ?");
      updateParams.push(pickup_lng);
    }
    if (drop_location !== undefined) {
      updateFields.push("drop_location = ?");
      updateParams.push(drop_location);
    }
    if (drop_lat !== undefined) {
      updateFields.push("drop_lat = ?");
      updateParams.push(drop_lat);
    }
    if (drop_lng !== undefined) {
      updateFields.push("drop_lng = ?");
      updateParams.push(drop_lng);
    }
    if (ride_date !== undefined) {
      updateFields.push("ride_date = ?");
      updateParams.push(ride_date);
    }
    if (ride_time !== undefined) {
      updateFields.push("ride_time = ?");
      updateParams.push(ride_time);
    }
    if (seats_available !== undefined) {
      updateFields.push("seats_available = ?");
      updateParams.push(seats_available);
    }
    if (amount_per_seat !== undefined) {
      updateFields.push("amount_per_seat = ?");
      updateParams.push(amount_per_seat);
    }
    if (pickup_note !== undefined) {
      updateFields.push("pickup_note = ?");
      updateParams.push(pickup_note);
    }

    if (updateFields.length === 0) {
      conn.release();
      return res.status(400).json({
        success: false,
        message: "No fields to update",
      });
    }

    updateParams.push(rideId);

    const [result] = await conn.query(
      `UPDATE rides SET ${updateFields.join(", ")} WHERE id = ?`,
      updateParams
    );

    conn.release();

    return res.json({
      success: true,
      message: "Ride updated successfully",
      data: {
        id: rideId,
        ...req.body,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Failed to update ride",
      error: err.message,
    });
  }
});

// Delete ride
router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    const rideId = req.params.id;
    const conn = await pool.getConnection();

    // Check if ride exists
    const [checkRows] = await conn.query("SELECT id FROM rides WHERE id = ?", [
      rideId,
    ]);

    if (checkRows.length === 0) {
      conn.release();
      return res.status(404).json({
        success: false,
        message: "Ride not found",
      });
    }

    const [result] = await conn.query("DELETE FROM rides WHERE id = ?", [
      rideId,
    ]);

    conn.release();

    return res.json({
      success: true,
      message: "Ride deleted successfully",
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Failed to delete ride",
      error: err.message,
    });
  }
});


module.exports = router;
