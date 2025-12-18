const express = require("express");
const router = express.Router();
const pool = require("../../db/connection.js");
const authenticateToken = require("../../middleware/auth.js");

// Get all vehicles with optional filters
router.get("/", async (req, res) => {
  try {
    const {
      user_id,
      vehicle_make,
      vehicle_model,
      vehicle_year,
      license_plate,
      id,
    } = req.query;

    const baseUrl =
      process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;

    const conn = await pool.getConnection();

    let query = `SELECT 
      v.id AS vehicle_id,
      v.*,
      u.id AS user_id,
      u.phone,
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
      u.account_active
    FROM vehicles v
    LEFT JOIN users u ON v.user_id = u.id
    WHERE 1=1`;

    let params = [];

    // Filters
    if (id) {
      query += " AND v.id = ?";
      params.push(id);
    }

    if (user_id) {
      query += " AND v.user_id = ?";
      params.push(user_id);
    }

    if (vehicle_make) {
      query += " AND v.vehicle_make LIKE ?";
      params.push(`%${vehicle_make}%`);
    }

    if (vehicle_model) {
      query += " AND v.vehicle_model LIKE ?";
      params.push(`%${vehicle_model}%`);
    }

    if (vehicle_year) {
      query += " AND v.vehicle_year = ?";
      params.push(vehicle_year);
    }

    if (license_plate) {
      query += " AND v.license_plate LIKE ?";
      params.push(`%${license_plate}%`);
    }

    const [rows] = await conn.query(query, params);
    conn.release();

    // Format Response - Fixed backslash issue
    const result = rows.map((r) => {
      const user = {
        id: r.user_id,
        phone: r.phone,
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
        profile_pic: r.profile_pic
          ? `${baseUrl}/${r.profile_pic.replace(/\\/g, "/")}`
          : null,
        gov_id_image: r.gov_id_image
          ? `${baseUrl}/${r.gov_id_image.replace(/\\/g, "/")}`
          : null,
        created_at: r.user_created_at,
        updated_at: r.user_updated_at,
        account_active: r.account_active,
      };

      const vehicle = {
        id: r.vehicle_id,
        user_id: r.user_id,
        vehicle_make: r.vehicle_make,
        vehicle_model: r.vehicle_model,
        vehicle_year: r.vehicle_year,
        license_plate: r.license_plate,
        vehicle_image: r.vehicle_image
          ? `${baseUrl}/${r.vehicle_image.replace(/\\/g, "/")}`
          : null,
        created_at: r.created_at,
      };

      return { ...vehicle, user };
    });

    return res.json({
      success: true,
      data: result,
      count: result.length,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch vehicles",
      error: err.message,
    });
  }
});



// Get vehicle by ID
router.get("/:id", async (req, res) => {
  try {
    const vehicleId = req.params.id;
    const conn = await pool.getConnection();

    const query = `SELECT 
  v.id AS vehicle_id,
  v.*,
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
  u.account_active
FROM vehicles v
LEFT JOIN users u ON v.user_id = u.id
WHERE v.id = ?`;

    const [rows] = await conn.query(query, [vehicleId]);
    conn.release();

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Vehicle not found",
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

    const vehicle = {
      id: r.vehicle_id,
      user_id: r.user_id,
      vehicle_make: r.vehicle_make,
      vehicle_model: r.vehicle_model,
      vehicle_year: r.vehicle_year,
      license_plate: r.license_plate,
      vehicle_image: r.vehicle_image,
      created_at: r.created_at,
    };

    return res.json({
      success: true,
      data: { ...vehicle, user },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch vehicle",
      error: err.message,
    });
  }
});

// Create new vehicle
router.post("/", authenticateToken, async (req, res) => {
  try {
    const {
      user_id,
      vehicle_make,
      vehicle_model,
      vehicle_year,
      license_plate,
      vehicle_image,
    } = req.body;

    if (
      !user_id ||
      !vehicle_make ||
      !vehicle_model ||
      !vehicle_year ||
      !license_plate
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Missing required fields: user_id, vehicle_make, vehicle_model, vehicle_year, license_plate",
      });
    }

    const conn = await pool.getConnection();

    const [result] = await conn.query(
      `INSERT INTO vehicles (user_id, vehicle_make, vehicle_model, vehicle_year, license_plate, vehicle_image, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [
        user_id,
        vehicle_make,
        vehicle_model,
        vehicle_year,
        license_plate,
        vehicle_image || null,
      ]
    );

    conn.release();

    return res.status(201).json({
      success: true,
      message: "Vehicle created successfully",
      data: {
        id: result.insertId,
        user_id,
        vehicle_make,
        vehicle_model,
        vehicle_year,
        license_plate,
        vehicle_image,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Failed to create vehicle",
      error: err.message,
    });
  }
});

// Update vehicle
router.put("/:id", authenticateToken, async (req, res) => {
  try {
    const vehicleId = req.params.id;
    const {
      vehicle_make,
      vehicle_model,
      vehicle_year,
      license_plate,
      vehicle_image,
    } = req.body;

    const conn = await pool.getConnection();

    // Check if vehicle exists
    const [checkRows] = await conn.query(
      "SELECT id FROM vehicles WHERE id = ?",
      [vehicleId]
    );

    if (checkRows.length === 0) {
      conn.release();
      return res.status(404).json({
        success: false,
        message: "Vehicle not found",
      });
    }

    const [result] = await conn.query(
      `UPDATE vehicles 
       SET vehicle_make = ?, vehicle_model = ?, vehicle_year = ?, license_plate = ?, vehicle_image = ?
       WHERE id = ?`,
      [
        vehicle_make,
        vehicle_model,
        vehicle_year,
        license_plate,
        vehicle_image || null,
        vehicleId,
      ]
    );

    conn.release();

    return res.json({
      success: true,
      message: "Vehicle updated successfully",
      data: {
        id: vehicleId,
        vehicle_make,
        vehicle_model,
        vehicle_year,
        license_plate,
        vehicle_image,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Failed to update vehicle",
      error: err.message,
    });
  }
});

// Delete vehicle
router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    const vehicleId = req.params.id;
    const conn = await pool.getConnection();

    // Check if vehicle exists
    const [checkRows] = await conn.query(
      "SELECT id FROM vehicles WHERE id = ?",
      [vehicleId]
    );

    if (checkRows.length === 0) {
      conn.release();
      return res.status(404).json({
        success: false,
        message: "Vehicle not found",
      });
    }

    const [result] = await conn.query("DELETE FROM vehicles WHERE id = ?", [
      vehicleId,
    ]);

    conn.release();

    return res.json({
      success: true,
      message: "Vehicle deleted successfully",
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Failed to delete vehicle",
      error: err.message,
    });
  }
});

router.put("/vehicle/status/:id", authenticateToken, async (req, res) => {
  try {
    const vehicleId = req.params.id;
    const { status } = req.body; // approved / rejected

    if (!status || !["approved", "rejected"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status must be 'approved' or 'rejected'",
      });
    }

    const conn = await pool.getConnection();

    const [result] = await conn.query(
      "UPDATE vehicles SET approval_status = ? WHERE id = ?",
      [status, vehicleId]
    );

    conn.release();

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Vehicle not found",
      });
    }

    res.json({
      success: true,
      message: `Vehicle ${status} successfully`,
      vehicle_id: vehicleId,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Failed to update vehicle status",
      error: err.message,
    });
  }
});

module.exports = router;
