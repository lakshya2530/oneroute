// routes/rides.js
const express = require("express");
const router = express.Router();
const pool = require("../db/connection.js");
const authenticateToken = require("../middleware/auth.js");
const upload = require("../middleware/upload.js");

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
       ride_date, ride_time, seats_available, amount_per_seat, pickup_note, ride_status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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


// Get My Offered Rides
router.get("/my_offered_ride", authenticateToken, async (req, res) => {
  const { phone } = req.user;

  const conn = await pool.getConnection();
  try {
    // Get logged-in user's id
    const [[user]] = await conn.query("SELECT id FROM users WHERE phone = ?", [
      phone,
    ]);
    if (!user) return res.status(404).json({ msg: "User not found" });

    const ownerId = user.id;

    // Extract all ride requests where the logged-in user is owner_id
    const [rideRequests] = await conn.query(
      "SELECT * FROM ride_requests WHERE owner_id = ? AND status = ?",
      [ownerId, "accepted"]
    );

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
  const { search, filterDate } = req.query;
  const { phone } = req.user;

  let sql = `
    SELECT rides.*
    FROM rides
    JOIN users u ON rides.user_id = u.id
    WHERE u.phone != ?`;
  const params = [phone];

  // 🔍 Filter by search on drop location
  if (search) {
    sql += ` AND rides.drop_location LIKE ?`;
    params.push(`%${search}%`);
  }

  // 🗓️ Smart Date Filtering (uses created_at when ride_date invalid)
  const dateField = `
    CASE 
      WHEN rides.ride_date IS NULL 
        OR rides.ride_date < '2000-01-01' 
      THEN rides.created_at 
      ELSE rides.ride_date 
    END
  `;

  if (filterDate === "today") {
    sql += ` AND DATE(${dateField}) = CURDATE()`;
  } else if (filterDate === "tomorrow") {
    sql += ` AND DATE(${dateField}) = DATE_ADD(CURDATE(), INTERVAL 1 DAY)`;
  } else if (filterDate && /^\d{4}-\d{2}-\d{2}$/.test(filterDate)) {
    sql += ` AND DATE(${dateField}) = ?`;
    params.push(filterDate);
  }

  try {
    const conn = await pool.getConnection();

    // Debug to confirm logic
    const [debug] = await conn.query(
      "SELECT id, ride_date, created_at FROM rides"
    );
    console.log("🪶 Debug rides:", debug);

    const [rides] = await conn.query(sql, params);
    conn.release();

    res.json({
      success: true,
      count: rides.length,
      rides,
    });
  } catch (err) {
    console.error("❌ Error fetching rides:", err);
    res.status(500).json({ msg: "Failed to fetch rides", error: err.message });
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
    // Get the passenger's user ID based on phone number
    const [[user]] = await conn.query("SELECT id FROM users WHERE phone = ?", [
      phone,
    ]);
    if (!user) return res.status(404).json({ msg: "User not found" });
    const passenger_id = user.id;

    // Get the ride details including ride owner user_id
    const [[ride]] = await conn.query("SELECT * FROM rides WHERE id = ?", [
      ride_id,
    ]);
    if (!ride) return res.status(404).json({ msg: "Ride not found" });
    if (ride.ride_status !== "open")
      return res.status(400).json({ msg: "Ride is not open for booking" });
    if (no_of_seats > ride.seats_available)
      return res.status(400).json({ msg: "Not enough seats available" });

    const estimated_amount = no_of_seats * ride.amount_per_seat;

    // Insert ride request with both passenger_id and ride owner_id
    await conn.query(
      `INSERT INTO ride_requests 
        (ride_id, passenger_id, owner_id, pickup_stop, no_of_seats, estimated_amount, message) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        ride_id,
        passenger_id,
        ride.user_id, // <-- ride owner ID stored here
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

      console.log(owner);

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

    console.log(user.id, rideId);

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
