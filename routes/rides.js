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

// --- Get All Rides Near User (with optional destination) or All Rides ---
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

// --- Get Full Ride Details (Driver + All Customers + Vehicle) ---
router.get("/ride/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { phone } = req.user; // phone from JWT
  const conn = await pool.getConnection();

  try {
    // --- 1. Base URL for images ---
    const BASE_URL = `${req.protocol}://${req.get("host")}/`;

    // --- 2. Get ride, driver & vehicle details ---
    const [rideRows] = await conn.query(
      `
      SELECT 
        r.*,
        u.id AS driver_id,
        u.fullname AS driver_name,
        u.phone AS driver_phone,
        u.gender AS driver_gender,
        u.address AS driver_address,
        u.city AS driver_city,
        u.state AS driver_state,
        u.dob AS driver_dob,
        u.occupation AS driver_occupation,
        u.gov_id_number AS driver_gov_id_number,
        u.profile_pic AS driver_profile_pic,
        u.gov_id_image AS driver_gov_id_image,
        v.id AS vehicle_id,
        v.vehicle_make,
        v.vehicle_model,
        v.vehicle_year,
        v.license_plate,
        v.vehicle_image
      FROM rides r
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN vehicles v ON r.user_id = v.user_id
      WHERE r.id = ?
      `,
      [id]
    );

    if (rideRows.length === 0) {
      return res.status(404).json({
        success: false,
        msg: "Ride not found",
      });
    }

    const rideRow = rideRows[0];

    // --- 3. Structure Ride Info ---
    const ride = {
      id: rideRow.id,
      pickup_location: rideRow.pickup_location,
      drop_location: rideRow.drop_location,
      pickup_lat: rideRow.pickup_lat,
      pickup_lng: rideRow.pickup_lng,
      drop_lat: rideRow.drop_lat,
      drop_lng: rideRow.drop_lng,
      ride_date: rideRow.ride_date,
      ride_time: rideRow.ride_time,
      seats_available: rideRow.seats_available,
      amount_per_seat: rideRow.amount_per_seat,
      pickup_note: rideRow.pickup_note,
      ride_status: rideRow.ride_status,
      created_at: rideRow.created_at,
      updated_at: rideRow.updated_at,
    };

    // --- 4. Structure Driver Info ---
    const driver = {
      id: rideRow.driver_id,
      fullname: rideRow.driver_name,
      phone: rideRow.driver_phone,
      gender: rideRow.driver_gender,
      dob: rideRow.driver_dob,
      occupation: rideRow.driver_occupation,
      address: rideRow.driver_address,
      city: rideRow.driver_city,
      state: rideRow.driver_state,
      gov_id_number: rideRow.driver_gov_id_number,
      profile_pic: rideRow.driver_profile_pic
        ? BASE_URL + rideRow.driver_profile_pic.replace(/\\/g, "/")
        : null,
      gov_id_image: rideRow.driver_gov_id_image
        ? BASE_URL + rideRow.driver_gov_id_image.replace(/\\/g, "/")
        : null,
    };

    // --- 5. Structure Vehicle Info ---
    const vehicle = rideRow.vehicle_id
      ? {
          id: rideRow.vehicle_id,
          vehicle_make: rideRow.vehicle_make,
          vehicle_model: rideRow.vehicle_model,
          vehicle_year: rideRow.vehicle_year,
          license_plate: rideRow.license_plate,
          vehicle_image: rideRow.vehicle_image
            ? BASE_URL + rideRow.vehicle_image.replace(/\\/g, "/")
            : null,
        }
      : null;

    // --- 6. Get all Customers who requested this ride ---
    const [requestRows] = await conn.query(
      `
      SELECT 
        rr.id AS request_id,
        rr.pickup_stop,
        rr.no_of_seats,
        rr.estimated_amount,
        rr.message,
        rr.status,
        rr.created_at AS request_created_at,
        rr.pickup_stop_lat,
        rr.pickup_stop_lng,
        u.id AS user_id,
        u.fullname,
        u.phone,
        u.gender,
        u.dob,
        u.occupation,
        u.address,
        u.city,
        u.state,
        u.gov_id_number,
        u.profile_pic,
        u.gov_id_image
      FROM ride_requests rr
      LEFT JOIN users u ON rr.passenger_id = u.id
      WHERE rr.ride_id = ?
      ORDER BY rr.created_at DESC
      `,
      [id]
    );

    // --- 7. Structure all Customer Request Details ---
    const customers = requestRows.map((row) => ({
      request_id: row.request_id,
      pickup_stop: row.pickup_stop,
      no_of_seats: row.no_of_seats,
      estimated_amount: row.estimated_amount,
      message: row.message,
      status: row.status,
      request_created_at: row.request_created_at,
      pickup_stop_lat: row.pickup_stop_lat,
      pickup_stop_lng: row.pickup_stop_lng,
      customer: {
        id: row.user_id,
        fullname: row.fullname,
        phone: row.phone,
        gender: row.gender,
        dob: row.dob,
        occupation: row.occupation,
        address: row.address,
        city: row.city,
        state: row.state,
        gov_id_number: row.gov_id_number,
        profile_pic: row.profile_pic
          ? BASE_URL + row.profile_pic.replace(/\\/g, "/")
          : null,
        gov_id_image: row.gov_id_image
          ? BASE_URL + row.gov_id_image.replace(/\\/g, "/")
          : null,
      },
    }));

    // --- 8. Send Combined Data ---
    res.json({
      success: true,
      ride,
      driver,
      vehicle,
      customers, // all passengers who requested this ride
    });
  } catch (err) {
    console.error("Error fetching ride details:", err);
    res.status(500).json({
      success: false,
      msg: "Failed to fetch ride details",
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

// Ride Request for Owner (Under Created Rides)
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
