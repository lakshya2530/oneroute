// routes/rides.js
const express = require("express");
const router = express.Router();
const pool = require("../db/connection.js");
const authenticateToken = require("../middleware/auth.js");
const upload = require("../middleware/upload.js");
const sendPushNotification = require("../utils/pushNotification.js");

const DEFAULT_OTP = "1234";

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
    vehicle_id,
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
    !amount_per_seat ||
    !vehicle_id
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
       ride_date, ride_time, seats_available, amount_per_seat, pickup_note, ride_status, vehicle_id) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        "open",
        vehicle_id,
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

// --- Get My All Rides ---
router.get("/my-all-rides", authenticateToken, async (req, res) => {
  const { phone } = req.user;

  const conn = await pool.getConnection();
  try {
    const [userRows] = await conn.query(
      "SELECT id, fullname, phone, gender, dob, occupation, address, city, state, gov_id_number, profile_pic FROM users WHERE phone = ?",
      [phone]
    );
    if (userRows.length === 0) {
      return res.status(404).json({ msg: "User not found" });
    }
    const user = userRows[0];

    const [rides] = await conn.query("SELECT * FROM rides WHERE user_id = ?", [
      user.id,
    ]);

    res.json({
      success: true,
      count: rides.length,
      user: user,
      rides,
    });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ msg: "Failed to fetch your rides", error: err.message });
  } finally {
    conn.release();
  }
});

// Get My Offered Rides (with Drop Location)
router.get("/my_offered_ride", authenticateToken, async (req, res) => {
  const { phone } = req.user;
  const conn = await pool.getConnection();

  try {
    // Get owner info
    const [[owner]] = await conn.query(
      `SELECT id, fullname, phone, gender, dob, occupation, address, city, state, gov_id_number, profile_pic 
       FROM users 
       WHERE phone = ?`,
      [phone]
    );
    if (!owner) return res.status(404).json({ msg: "User not found" });

    const ownerId = owner.id;

    const [rideRequestsRaw] = await conn.query(
      `
  SELECT rr.id, rr.ride_id, rr.passenger_id, rr.pickup_stop, rr.no_of_seats,
         rr.estimated_amount, rr.message, rr.status, rr.created_at,
         rr.pickup_stop_lat, rr.pickup_stop_lng, rr.owner_id,
         r.pickup_location, r.drop_location, r.ride_date, r.ride_time, r.amount_per_seat,
         u.id AS passenger_id, u.fullname AS passenger_fullname, u.phone AS passenger_phone,
         u.gender AS passenger_gender, u.dob AS passenger_dob, u.occupation AS passenger_occupation,
         u.address AS passenger_address, u.city AS passenger_city, u.state AS passenger_state,
         u.gov_id_number AS passenger_gov_id_number, u.profile_pic AS passenger_profile_pic
  FROM ride_requests rr
  JOIN rides r ON rr.ride_id = r.id
  JOIN users u ON rr.passenger_id = u.id
  WHERE rr.owner_id = ? AND rr.status = 'accepted'
`,
      [ownerId]
    );

    const rideRequests = rideRequestsRaw.map((rr) => ({
      id: rr.id,
      ride_id: rr.ride_id,
      pickup_stop: rr.pickup_stop,
      no_of_seats: rr.no_of_seats,
      estimated_amount: rr.estimated_amount,
      message: rr.message,
      status: rr.status,
      created_at: rr.created_at,
      pickup_stop_lat: rr.pickup_stop_lat,
      pickup_stop_lng: rr.pickup_stop_lng,
      owner_id: rr.owner_id,
      owner,
      ride: {
        id: rr.ride_id,
        pickup_location: rr.pickup_location,
        drop_location: rr.drop_location,
        ride_date: rr.ride_date,
        ride_time: rr.ride_time,
        amount_per_seat: rr.amount_per_seat,
      },
      passenger: {
        id: rr.passenger_id,
        fullname: rr.passenger_fullname,
        phone: rr.passenger_phone,
        gender: rr.passenger_gender,
        dob: rr.passenger_dob,
        occupation: rr.passenger_occupation,
        address: rr.passenger_address,
        city: rr.passenger_city,
        state: rr.passenger_state,
        gov_id_number: rr.passenger_gov_id_number,
        profile_pic: rr.passenger_profile_pic,
      },
    }));

    res.json({
      success: true,
      count: rideRequests.length,
      rideRequests,
    });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ msg: "Failed to fetch offered rides", error: err.message });
  } finally {
    conn.release();
  }
});

// --- Get All Rides Near User (with optional destination or date filter) ---
router.get("/get-rides", authenticateToken, async (req, res) => {
  const { search, start_date } = req.query;
  const { phone } = req.user;

  let sql = `
    SELECT r.*
    FROM rides r
    JOIN users u ON r.user_id = u.id
    WHERE u.phone != ?
  `;

  const params = [phone];

  // 🔍 Drop location search
  if (search) {
    sql += ` AND r.drop_location LIKE ?`;
    params.push(`%${search}%`);
  }

  // ✅ EXACT DATE FILTER (THIS IS THE KEY FIX)
  if (start_date) {
    sql += `
      AND r.ride_date >= ?
      AND r.ride_date < DATE_ADD(?, INTERVAL 1 DAY)
    `;
    params.push(start_date, start_date);
  }

  sql += ` ORDER BY r.created_at DESC`;

  try {
    const conn = await pool.getConnection();
    const [rides] = await conn.query(sql, params);
    conn.release();

    return res.json({
      success: true,
      count: rides.length,
      rides,
    });
  } catch (err) {
    console.error("❌ Error fetching rides:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch rides",
      error: err.message,
    });
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
  WHERE rr.ride_id = ? AND rr.status = 'accepted'
  ORDER BY rr.created_at DESC
  LIMIT 1
  `,
      [id]
    );

    // --- 7. Structure all Customer Request Details ---
    const customers =
      requestRows.length > 0
        ? {
            request_id: requestRows[0].request_id,
            pickup_stop: requestRows[0].pickup_stop,
            no_of_seats: requestRows[0].no_of_seats,
            estimated_amount: requestRows[0].estimated_amount,
            message: requestRows[0].message,
            status: requestRows[0].status,
            request_created_at: requestRows[0].request_created_at,
            pickup_stop_lat: requestRows[0].pickup_stop_lat,
            pickup_stop_lng: requestRows[0].pickup_stop_lng,
            customer: {
              id: requestRows[0].user_id,
              fullname: requestRows[0].fullname,
              phone: requestRows[0].phone,
              gender: requestRows[0].gender,
              dob: requestRows[0].dob,
              occupation: requestRows[0].occupation,
              address: requestRows[0].address,
              city: requestRows[0].city,
              state: requestRows[0].state,
              gov_id_number: requestRows[0].gov_id_number,
              profile_pic: requestRows[0].profile_pic
                ? BASE_URL + requestRows[0].profile_pic.replace(/\\/g, "/")
                : null,
              gov_id_image: requestRows[0].gov_id_image
                ? BASE_URL + requestRows[0].gov_id_image.replace(/\\/g, "/")
                : null,
            },
          }
        : null;

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

// --- Get My All Ride Requests (Joined with Ride Details + Filter) ---
router.get("/my-all-ride-requests", authenticateToken, async (req, res) => {
  const { phone } = req.user;
  const { status } = req.query; // optional filter: accepted | pending | rejected | cancelled

  const conn = await pool.getConnection();
  try {
    // 1️⃣ Get logged-in user ID
    const [userRows] = await conn.query(
      "SELECT id FROM users WHERE phone = ?",
      [phone]
    );

    if (userRows.length === 0) {
      return res.status(404).json({ msg: "User not found" });
    }

    const userId = userRows[0].id;

    // 2️⃣ Base query: Join ride_request + rides
    let query = `
      SELECT 
        rr.id AS request_id,
        rr.ride_id,
        rr.passenger_id,
        rr.owner_id,
        rr.pickup_stop,
        rr.no_of_seats,
        rr.estimated_amount,
        rr.message,
        rr.status AS request_status,
        rr.created_at AS request_created_at,
        rr.pickup_stop_lat,
        rr.pickup_stop_lng,

        r.user_id AS ride_owner_id,
        r.pickup_location AS ride_pickup_location,
        r.pickup_lat AS ride_pickup_lat,
        r.pickup_lng AS ride_pickup_lng,
        r.drop_location AS ride_drop_location,
        r.drop_lat AS ride_drop_lat,
        r.drop_lng AS ride_drop_lng,
        r.ride_date,
        r.ride_time,
        r.seats_available,
        r.amount_per_seat,
        r.pickup_note,
        r.ride_status,
        r.created_at AS ride_created_at
      FROM ride_requests rr
      LEFT JOIN rides r ON rr.ride_id = r.id
      WHERE rr.passenger_id = ?
    `;

    const params = [userId];

    // 3️⃣ Optional filtering by request status
    if (status) {
      query += " AND rr.status = ?";
      params.push(status);
    }

    query += " ORDER BY rr.created_at DESC";

    // 4️⃣ Execute query
    const [rideRequests] = await conn.query(query, params);

    res.json({
      success: true,
      filter: status || "all",
      count: rideRequests.length,
      rideRequests,
    });
  } catch (err) {
    console.error("Error fetching ride requests:", err);
    res.status(500).json({
      msg: "Failed to fetch ride requests",
      error: err.message,
    });
  } finally {
    conn.release();
  }
});

// ------------ Get Users Offered Rides --------------------

//---------------- Request Rides (Ride Booking Flow) ----------------------
router.post("/ride-requests", authenticateToken, async (req, res) => {
  const phone = req.user.phone;
  const { ride_id, pickup_stop, no_of_seats, message } = req.body;

  if (!ride_id || !pickup_stop || !no_of_seats) {
    return res.status(400).json({ msg: "Missing required fields" });
  }

  const conn = await pool.getConnection();
  try {
    // Get passenger
    const [[user]] = await conn.query(
      "SELECT id, fullname FROM users WHERE phone = ?",
      [phone]
    );
    if (!user) return res.status(404).json({ msg: "User not found" });
    const passenger_id = user.id;

    // Get ride
    const [[ride]] = await conn.query("SELECT * FROM rides WHERE id = ?", [
      ride_id,
    ]);
    if (!ride) return res.status(404).json({ msg: "Ride not found" });
    if (ride.ride_status !== "open")
      return res.status(400).json({ msg: "Ride is not open" });
    if (no_of_seats > ride.seats_available)
      return res.status(400).json({ msg: "Not enough seats" });

    const estimated_amount = no_of_seats * ride.amount_per_seat;

    // Insert request FIRST (no FCM dependency)
    const result = await conn.query(
      `INSERT INTO ride_requests (ride_id, passenger_id, owner_id, pickup_stop, no_of_seats, estimated_amount, message, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        ride_id,
        passenger_id,
        ride.user_id,
        pickup_stop,
        no_of_seats,
        estimated_amount,
        message || null,
      ]
    );

    // Response immediately - success guaranteed
    res.json({
      success: true,
      msg: "Ride request sent successfully",
      request_id: result.insertId,
    });

    // Fire-and-forget notification (won't block response)
    (async () => {
      try {
        const [[owner]] = await conn.query(
          "SELECT id, fullname, fcm_token FROM users WHERE id = ?",
          [ride.user_id]
        );
        if (owner && owner.fcm_token) {
          await sendPushNotification(
            owner.fcm_token,
            "New Ride Request!",
            `${
              user.fullname || "Passenger"
            } requested ${no_of_seats} seat(s) from ${pickup_stop}`,
            {
              type: "ride_request",
              ride_id: ride_id.toString(),
              request_id: result.insertId.toString(),
              passenger_id: passenger_id.toString(),
              no_of_seats: no_of_seats.toString(),
              estimated_amount: estimated_amount.toString(),
              action: "view_requests",
            },
            owner.id.toString()
          );
        }
      } catch (notifyErr) {
        console.error("❌ Notification failed (non-blocking):", notifyErr);
        // Don't fail the main request
      } finally {
        conn.release(); // Release after main response
      }
    })();
  } catch (err) {
    console.error("❌ Ride request error:", err);
    res.status(500).json({ msg: "Failed to request ride", error: err.message });
  }
});




// Ride Request for Owner (Under Created Rides)
router.get("/:rideId/requests", authenticateToken, async (req, res) => {
  const phone = req.user.phone;
  const { rideId } = req.params;

  const conn = await pool.getConnection();
  try {
    const baseUrl =
      process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;

    // Get owner id from phone
    const [[user]] = await conn.query("SELECT * FROM users WHERE phone = ?", [
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
    const [requestsRaw] = await conn.query(
      `SELECT rr.*, u.id AS user_id, u.fullname, u.phone, u.gender, u.profile_pic
       FROM ride_requests rr
       JOIN users u ON rr.passenger_id = u.id
       WHERE rr.ride_id = ?`,
      [rideId]
    );

    // Add full URLs dynamically for profile_pic and gov_id_image fields
    const requests = requestsRaw.map((r) => {
      return {
        ...r,
        profile_pic: r.profile_pic
          ? `${baseUrl}/${r.profile_pic.replace(/\\/g, "/")}`
          : null,
      };
    });

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

// ------------ Cancel the Requested Ride ------------------ (By Customer)
router.get(
  "/ride-requests/:rideId/cancel",
  authenticateToken,
  async (req, res) => {
    const requestId = req.params.rideId;
    const phone = req.user.phone;

    try {
      const conn = await pool.getConnection();

      // 1️⃣ Get passenger + request in single query
      const [[reqData]] = await conn.query(
        `
      SELECT rr.id, rr.status, rr.passenger_id, rr.no_of_seats,
             r.id AS ride_id, r.seats_available, r.user_id AS owner_id,
             u.fullname, u2.fcm_token
      FROM ride_requests rr
      JOIN rides r ON r.id = rr.ride_id
      JOIN users u ON u.id = rr.passenger_id
      JOIN users u2 ON u2.id = r.user_id
      WHERE rr.id = ? AND u.phone = ?
    `,
        [requestId, phone]
      );

      conn.release();

      if (!reqData) {
        return res
          .status(404)
          .json({ msg: "Request not found or access denied" });
      }

      // 2️⃣ Quick status checks
      if (reqData.status === "rejected" || reqData.status === "cancelled") {
        return res.status(400).json({ msg: "Cannot cancel this status" });
      }

      // 3️⃣ Update (simple single query - no transaction)
      const updateConn = await pool.getConnection();
      try {
        // Restore seats if accepted
        if (reqData.status === "accepted") {
          await updateConn.query(
            "UPDATE rides SET seats_available = seats_available + ? WHERE id = ?",
            [reqData.no_of_seats, reqData.ride_id]
          );
        }

        // Cancel request
        await updateConn.query(
          "UPDATE ride_requests SET status = 'cancelled' WHERE id = ?",
          [requestId]
        );
        updateConn.release();

        // 4️⃣ Fire-and-forget notification
        if (reqData.fcm_token) {
          (async () => {
            try {
              await sendPushNotification(
                reqData.fcm_token,
                "Ride Request Cancelled",
                `${reqData.fullname} cancelled their request`,
                {
                  type: "ride_request_cancelled",
                  request_id: requestId.toString(),
                  ride_id: reqData.ride_id.toString(),
                  action: "view_requests",
                },
                reqData.owner_id.toString()
              );
            } catch (notifyErr) {
              console.error("Notify failed:", notifyErr);
            }
          })();
        }

        res.json({ success: true, msg: "Request cancelled successfully" });
      } catch (updateErr) {
        updateConn.release();
        throw updateErr; // Re-throw to main catch
      }
    } catch (err) {
      console.error("Cancel error:", err);
      res.status(500).json({ msg: "Failed to cancel", error: err.message });
    }
  }
);




// Accept or Reject the Ride Request (Ride Owner)
router.post(
  "/ride-requests/:requestId/respond",
  authenticateToken,
  async (req, res) => {
    const ownerPhone = req.user.phone;
    const { requestId } = req.params;
    const { action, passenger_id } = req.body;
    const conn = await pool.getConnection();

    try {
      const [[owner]] = await conn.query("SELECT id FROM users WHERE phone=?", [
        ownerPhone,
      ]);
      if (!owner) return res.status(404).json({ msg: "Owner not found" });
      const owner_id = owner.id;

      const [[request]] = await conn.query(
        `
  SELECT rr.*, 
         r.user_id AS owner_id, 
         r.seats_available, 
         r.ride_status, 
         r.id AS ride_id, 
         rr.passenger_id AS passenger_id
  FROM ride_requests rr
  JOIN rides r ON rr.ride_id = r.id
  WHERE rr.id=?`,
        [requestId]
      );

      if (!request) return res.status(404).json({ msg: "Request not found" });
      if (request.owner_id !== owner_id)
        return res.status(403).json({ msg: "Not authorized" });

      if (action === "accept") {
        if (request.no_of_seats > request.seats_available)
          return res.status(400).json({ msg: "Not enough seats available" });

        const pickupOTP = DEFAULT_OTP;
        const dropOTP = DEFAULT_OTP;

        await conn.beginTransaction();

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

        await conn.query(
          `
  INSERT INTO ride_otps (ride_id, user_id, owner_id, pickup_otp, drop_otp, pickup_verified, drop_verified, created_at)
  VALUES (?, ?, ?, ?, ?, false, false, NOW())
  `,
          [
            request.ride_id,
            request.passenger_id,
            request.owner_id,
            pickupOTP,
            dropOTP,
          ]
        );

        await conn.commit();

        // Push Notification Code
        const [[passenger]] = await conn.query(
          "SELECT id, fullname, fcm_token FROM users WHERE id = ?",
          [request.passenger_id]
        );

        console.log(passenger[0]?.fcm_token,'wdwd');
        if (passenger[0]?.fcm_token) {

          await sendPushNotification(
            passenger[0].fcm_token,
            "🎉 Ride Confirmed!",
            `${owner.fullname || "Owner"} accepted your ride request!`,
            {
              type: "ride_accepted",
              ride_id: request.ride_id,
              pickup_otp: pickupOTP,
              drop_otp: dropOTP,
              action: "view_ride",
            },
            passenger[0].id
          );
        }

        console.log(
          `✅ Ride ${request.ride_id}: Pickup OTP=${pickupOTP}, Drop OTP=${dropOTP}`
        );
        res.json({ msg: "Ride accepted", pickupOTP, dropOTP });
      } else if (action === "reject") {
        await conn.query(
          `
        DELETE ro FROM ride_otps ro 
        JOIN ride_requests rr ON rr.ride_id = ro.ride_id 
        WHERE rr.id = ?`,
          [requestId]
        );

        await conn.query(
          "UPDATE ride_requests SET status='rejected' WHERE id=?",
          [requestId]
        );

        // Push notification
        const [[passenger]] = await conn.query(
          "SELECT id, fullname, fcm_token FROM users WHERE id = ?",
          [request.passenger_id]
        );
        
        console.log(request.passenger_id, 'FCM TOKEN')
        ;
        if (passenger[0]?.fcm_token) {
          await sendPushNotification(
            passenger[0].fcm_token,
            "❌ Ride Request Cancelled",
            "Your ride request has been cancelled by the owner.",
            {
              type: "ride_rejected",
              ride_id: request.ride_id,
              action: "find_rides",
            },
            passenger[0].id
          );
        }

        res.json({ msg: "Ride rejected and OTPs removed" });
      } else {
        res.status(400).json({ msg: "Invalid action" });
      }
    } catch (err) {
      console.error(err);
      await conn.rollback();
      res.status(500).json({ msg: "Failed to respond", error: err.message });
    } finally {
      conn.release();
    }
  }
);

//  Verify Pickup OTP (Start Ride)
router.post("/:rideId/verify-pickup", authenticateToken, async (req, res) => {
  const passengerPhone = req.user.phone;
  const { rideId } = req.params;
  const { otp, passenger_id } = req.body;
  const conn = await pool.getConnection();

  try {
    const [[user]] = await conn.query("SELECT id FROM users WHERE phone=?", [
      passengerPhone,
    ]);
    if (!user) return res.status(404).json({ msg: "User not found" });

    const [[otpRecord]] = await conn.query(
      "SELECT * FROM ride_otps WHERE ride_id=? AND owner_id=? AND user_id=?",
      // "SELECT * FROM ride_otps WHERE ride_id=? ",
      [rideId, user.id, passenger_id]
    );
    if (!otpRecord) return res.status(404).json({ msg: "No OTP found" });

    // ✅ accept either the DB OTP or default 1234 for testing
    if (otp !== otpRecord.pickup_otp && otp !== DEFAULT_OTP)
      return res.status(400).json({ msg: "Invalid pickup OTP" });

    await conn.beginTransaction();
    await conn.query("UPDATE ride_otps SET pickup_verified=true WHERE id=?", [
      otpRecord.id,
    ]);
    await conn.query("UPDATE rides SET ride_status='in_route' WHERE id=?", [
      rideId,
    ]);
    await conn.commit();

    // Push notification
    const [[owner]] = await conn.query(
      "SELECT u.id, u.fullname, u.fcm_token FROM users u JOIN rides r ON r.user_id = u.id WHERE r.id = ?",
      [rideId]
    );

    if (owner[0]?.fcm_token) {
      await sendPushNotification(
        owner[0].fcm_token,
        "Passenger Onboard",
        `${user.fullname || "Passenger"} verified pickup OTP. Ride started!`,
        {
          type: "ride_started",
          ride_id: rideId,
          status: "in_route",
          action: "track_ride",
        },
        owner[0].id
      );
    }

    res.json({ msg: "Pickup OTP verified, ride started." });
  } catch (err) {
    await conn.rollback();
    res
      .status(500)
      .json({ msg: "Failed to verify pickup OTP", error: err.message });
  } finally {
    conn.release();
  }
});

//  Mark Ride as Reached (Send Drop OTP)
router.post("/:rideId/reached", authenticateToken, async (req, res) => {
  const ownerPhone = req.user.phone;
  const { rideId } = req.params;
  const conn = await pool.getConnection();

  try {
    const [[owner]] = await conn.query("SELECT id FROM users WHERE phone=?", [
      ownerPhone,
    ]);
    if (!owner) return res.status(404).json({ msg: "Owner not found" });

    const [[ride]] = await conn.query(
      "SELECT * FROM rides WHERE id=? AND user_id=?",
      [rideId, owner.id]
    );
    if (!ride) return res.status(404).json({ msg: "Ride not found" });

    await conn.query(
      "UPDATE rides SET ride_status='reached_destination' WHERE id=?",
      [rideId]
    );

    // Push Notifications
    const [passengers] = await conn.query(
      `
  SELECT DISTINCT u.id, u.fullname, u.fcm_token 
  FROM users u 
  JOIN ride_requests rr ON rr.passenger_id = u.id 
  JOIN ride_otps ro ON ro.user_id = u.id 
  WHERE ro.ride_id = ? AND ro.drop_verified = FALSE
`,
      [rideId]
    );

    const passengerTokens = passengers.map((p) => p.fcm_token).filter(Boolean);
    if (passengerTokens.length) {
      await sendPushNotification(
        passengerTokens,
        "📍 Driver Reached Destination",
        "Your driver has reached the drop location. Use drop OTP to complete ride.",
        {
          type: "driver_reached",
          ride_id: rideId,
          drop_otp: DEFAULT_OTP.toString(),
          action: "verify_drop",
        },
        passengers.map((p) => p.id) // Multiple userIds
      );
    }

    console.log(`📍 Ride ${rideId}: Drop OTP = ${DEFAULT_OTP}`);
    res.json({
      msg: "Ride marked as reached. Drop OTP sent (default 1234).",
      dropOTP: DEFAULT_OTP,
    });
  } catch (err) {
    res
      .status(500)
      .json({ msg: "Failed to mark ride reached", error: err.message });
  } finally {
    conn.release();
  }
});

//  Verify Drop OTP (Complete Ride)
router.post("/:rideId/verify-drop", authenticateToken, async (req, res) => {
  const passengerPhone = req.user.phone;
  const { rideId } = req.params;
  const { otp, passenger_id } = req.body;
  const conn = await pool.getConnection();

  try {
    const [[user]] = await conn.query("SELECT id FROM users WHERE phone=?", [
      passengerPhone,
    ]);
    if (!user) return res.status(404).json({ msg: "User not found" });
    console.log(rideId, user.id, passenger_id);

    const [[otpRecord]] = await conn.query(
      "SELECT * FROM ride_otps WHERE ride_id=? AND owner_id=?",
      [rideId, user.id]
    );
    if (!otpRecord) return res.status(404).json({ msg: "No OTP record found" });
    // ✅ accept 1234 or matching drop_otp
    if (otp !== otpRecord.drop_otp && otp !== DEFAULT_OTP)
      return res.status(400).json({ msg: "Invalid drop OTP" });

    await conn.beginTransaction();
    await conn.query("UPDATE ride_otps SET drop_verified=true WHERE id=?", [
      otpRecord.id,
    ]);
    await conn.query("UPDATE rides SET ride_status='completed' WHERE id=?", [
      rideId,
    ]);
    await conn.query(
      "UPDATE ride_requests SET status='completed' WHERE passenger_id=?",
      [passenger_id]
    );
    await conn.query("DELETE FROM ride_otps WHERE id=?", [otpRecord.id]);
    await conn.commit();

    // Push Notifications
    const [[owner]] = await conn.query(
      "SELECT u.id, u.fullname, u.fcm_token FROM users u JOIN rides r ON r.user_id = u.id WHERE r.id = ?",
      [rideId]
    );

    if (owner[0]?.fcm_token) {
      await sendPushNotification(
        owner[0].fcm_token,
        "Ride Completed!",
        `${user.fullname || "Passenger"} completed the ride successfully!`,
        {
          type: "ride_completed",
          ride_id: rideId,
          action: "rate_ride",
        },
        owner[0].id
      );
    }

    res.json({ msg: "Drop OTP verified, ride completed successfully!" });
  } catch (err) {
    await conn.rollback();
    res
      .status(500)
      .json({ msg: "Failed to verify drop OTP", error: err.message });
  } finally {
    conn.release();
  }
});

module.exports = router;
