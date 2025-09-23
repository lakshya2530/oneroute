// routes/rides.js
const express = require("express");
const router = express.Router();
const pool = require("../db/connection.js");
const authenticateToken = require("../middleware/auth.js");
const upload = require("../middleware/upload.js");

// --- Create Ride ---
router.post("/", authenticateToken, upload.none(), async (req, res) => {
  const { phone } = req.user;
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

  if (
    !pickup_location ||
    !pickup_lat ||
    !pickup_lng ||
    !drop_location ||
    !drop_lat ||
    !drop_lng ||
    !ride_date ||
    !ride_time ||
    !seats_available ||
    !amount_per_seat
  ) {
    return res.status(400).json({ msg: "Missing required fields" });
  }

  const conn = await pool.getConnection();
  try {
    const [[user]] = await conn.query("SELECT * FROM users WHERE phone=?", [
      phone,
    ]);
    if (!user) return res.status(404).json({ msg: "User not found" });

    await conn.query(
      `INSERT INTO rides 
      (user_id, pickup_location, pickup_lat, pickup_lng, drop_location, drop_lat, drop_lng, 
       ride_date, ride_time, seats_available, amount_per_seat, pickup_note) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user.id,
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

    res.json({ msg: "Ride created successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Failed to create ride", error: err.message });
  } finally {
    conn.release();
  }
});

// --- Get Rides Near User (with optional destination) or All Rides ---
router.get("/get-rides", authenticateToken, async (req, res) => {
  const { lat, lng, search } = req.query;
  const fixedRadiusKm = 5;

  const conn = await pool.getConnection();
  try {
    let sql = `SELECT rides.* FROM rides WHERE 1=1`;
    let params = [];

    // If search filter is provided
    if (search) {
      sql += ` AND rides.drop_location LIKE ?`;
      params.push(`%${search}%`);
    }

    // If lat/lng provided → calculate distance
    if (lat && lng) {
      sql = `
        SELECT rides.*,
          (6371 * ACOS(
            COS(RADIANS(?)) * COS(RADIANS(CAST(rides.pickup_lat AS DECIMAL(10,7)))) *
            COS(RADIANS(CAST(rides.pickup_lng AS DECIMAL(10,7))) - RADIANS(?)) +
            SIN(RADIANS(?)) * SIN(RADIANS(CAST(rides.pickup_lat AS DECIMAL(10,7))))
          )) AS distance
        FROM rides
        WHERE 1=1
      `;

      if (search) {
        sql += ` AND rides.drop_location LIKE ?`;
        params.push(`%${search}%`);
      }

      sql += ` HAVING distance <= ? ORDER BY distance ASC`;
      params.unshift(lat, lng, lat); // Add lat/lng for Haversine calculation
      params.push(fixedRadiusKm);
    }

    const [rides] = await conn.query(sql, params);

    res.json({
      success: true,
      count: rides.length,
      rides,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Failed to fetch rides", error: err.message });
  } finally {
    conn.release();
  }
});

// --- Get Ride Details with Full User Info ---
router.get("/ride/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;

  const conn = await pool.getConnection();
  try {
    const [rides] = await conn.query(
      `
      SELECT r.*, u.*
      FROM rides r
      LEFT JOIN users u ON r.user_id = u.id
      WHERE r.id = ?
      `,
      [id]
    );

    if (rides.length === 0) {
      return res.status(404).json({ success: false, msg: "Ride not found" });
    }

    // Prepare array of objects
    const result = rides.map((row) => {
      // Separate ride fields and user fields to avoid duplicate keys
      const { id: rideId, user_id, ...rest } = row;

      // Ride fields
      const ride = {
        id: rideId,
        user_id: row.user_id,
        pickup_location: row.pickup_location,
        pickup_lat: row.pickup_lat,
        pickup_lng: row.pickup_lng,
        drop_location: row.drop_location,
        drop_lat: row.drop_lat,
        drop_lng: row.drop_lng,
        ride_date: row.ride_date,
        ride_time: row.ride_time,
        seats_available: row.seats_available,
        amount_per_seat: row.amount_per_seat,
        pickup_note: row.pickup_note,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };

      // User fields
      const user = {
        id: row.id,
        name: row.name,
        phone: row.phone,
        email: row.email,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };

      return { ride, user };
    });

    res.json({ success: true, data: result });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      msg: "Failed to fetch ride",
      error: err.message,
    });
  } finally {
    conn.release();
  }
});

module.exports = router;
