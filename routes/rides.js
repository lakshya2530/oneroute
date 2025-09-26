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

// Request Rides
router.post("/ride-requests", authenticateToken, async (req, res) => {
  const phone = req.user.phone;

  const { ride_id, pickup_stop, no_of_seats, message } = req.body;

  if (!ride_id || !pickup_stop || !no_of_seats) {
    return res.status(400).json({ msg: "Missing required fields" });
  }

  const conn = await pool.getConnection();
  try {
    // Get the user ID based on phone number
    const [[user]] = await conn.query("SELECT id FROM users WHERE phone = ?", [
      phone,
    ]);
    if (!user) return res.status(404).json({ msg: "User not found" });

    const passenger_id = user.id;

    // Get ride details
    const [[ride]] = await conn.query("SELECT * FROM rides WHERE id = ?", [
      ride_id,
    ]);
    if (!ride) return res.status(404).json({ msg: "Ride not found" });
    if (ride.ride_status !== "open")
      return res.status(400).json({ msg: "Ride is not open for booking" });
    if (no_of_seats > ride.seats_available)
      return res.status(400).json({ msg: "Not enough seats available" });

    const estimated_amount = no_of_seats * ride.amount_per_seat;

    // Insert ride request
    await conn.query(
      `INSERT INTO ride_requests (ride_id, passenger_id, pickup_stop, no_of_seats, estimated_amount, message) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        ride_id,
        passenger_id,
        pickup_stop,
        no_of_seats,
        estimated_amount,
        message || null,
      ]
    );

    res.json({ msg: "Ride request sent successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Failed to request ride", error: err.message });
  } finally {
    conn.release();
  }
});

// Ride Request for Owner
router.get("/rides/:rideId/requests", authenticateToken, async (req, res) => {
  const phone = req.user.phone;
  const { rideId } = req.params;

  const conn = await pool.getConnection();
  try {
    // Get owner id from phone
    const [[user]] = await conn.query("SELECT id FROM users WHERE phone = ?", [
      phone,
    ]);
    if (!user) return res.status(404).json({ msg: "User not found" });

    const owner_id = user.id;

    // Check if ride belongs to this owner
    const [[ride]] = await conn.query(
      "SELECT * FROM rides WHERE id = ? AND user_id = ?",
      [rideId, owner_id]
    );
    if (!ride)
      return res
        .status(404)
        .json({ msg: "Ride not found or you are not the owner" });

    // Fetch ride requests along with passenger details
    const [requests] = await conn.query(
      `SELECT rr.*, u.id AS user_id, u.fullname, u.phone, u.gender, u.profile_pic
       FROM ride_requests rr
       JOIN users u ON rr.passenger_id = u.id
       WHERE rr.ride_id = ?`,
      [rideId]
    );

    res.json({ ride, requests });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ msg: "Failed to fetch requests", error: err.message });
  } finally {
    conn.release();
  }
});

// Accept or Reject the Ride Request (Ride Owner)
router.post(
  "/ride-requests/:requestId/respond",
  authenticateToken,
  async (req, res) => {
    const ownerPhone = req.user.phone;
    const { requestId } = req.params;
    const { action } = req.body;

    const conn = await pool.getConnection();
    try {
      // Get owner ID based on phone number
      const [[owner]] = await conn.query(
        "SELECT id FROM users WHERE phone = ?",
        [ownerPhone]
      );
      if (!owner) return res.status(404).json({ msg: "Owner not found" });

      const owner_id = owner.id;

      // Get the ride request and ride details
      const [[request]] = await conn.query(
        `SELECT rr.*, r.user_id AS owner_id, r.seats_available, r.ride_status, r.id AS ride_id
         FROM ride_requests rr
         JOIN rides r ON rr.ride_id = r.id
         WHERE rr.id = ?`,
        [requestId]
      );

      if (!request) return res.status(404).json({ msg: "Request not found" });

      // Check if the authenticated owner is the ride owner
      if (request.owner_id !== owner_id)
        return res.status(403).json({ msg: "Not authorized" });

      if (action === "accept") {
        if (request.no_of_seats > request.seats_available) {
          return res.status(400).json({ msg: "Not enough seats available" });
        }

        // Update ride request status
        await conn.query(
          "UPDATE ride_requests SET status='accepted' WHERE id=?",
          [requestId]
        );

        const remainingSeats = request.seats_available - request.no_of_seats;
        const rideStatus = remainingSeats === 0 ? "full" : "open";
        await conn.query(
          "UPDATE rides SET seats_available=?, ride_status=? WHERE id=?",
          [remainingSeats, rideStatus, request.ride_id]
        );

        res.json({ msg: "Request accepted" });
      } else if (action === "reject") {
        // Update ride request status
        await conn.query(
          "UPDATE ride_requests SET status='rejected' WHERE id=?",
          [requestId]
        );

        res.json({ msg: "Request rejected" });
      } else {
        res.status(400).json({ msg: "Invalid action" });
      }
    } catch (err) {
      console.error(err);
      res.status(500).json({ msg: "Failed to respond", error: err.message });
    } finally {
      conn.release();
    }
  }
);

// Mark Ride As Completion
router.post("/rides/:rideId/complete", authenticateToken, async (req, res) => {
  const ownerPhone = req.user.phone;
  const { rideId } = req.params;

  const conn = await pool.getConnection();
  try {
    // Get owner ID based on phone number
    const [[owner]] = await conn.query("SELECT id FROM users WHERE phone = ?", [
      ownerPhone,
    ]);
    if (!owner) return res.status(404).json({ msg: "Owner not found" });

    const owner_id = owner.id;

    // Check if the ride belongs to this owner
    const [[ride]] = await conn.query(
      "SELECT * FROM rides WHERE id=? AND user_id=?",
      [rideId, owner_id]
    );
    if (!ride) return res.status(404).json({ msg: "Ride not found" });

    // Mark ride as completed
    await conn.query("UPDATE rides SET ride_status='completed' WHERE id=?", [
      rideId,
    ]);

    res.json({ msg: "Ride marked as completed" });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ msg: "Failed to complete ride", error: err.message });
  } finally {
    conn.release();
  }
});

module.exports = router;
