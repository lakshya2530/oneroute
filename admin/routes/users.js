const express = require("express");
const router = express.Router();
const pool = require("../../db/connection.js");
const authenticateToken = require("../../middleware/auth.js");

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// Get all users with optional filters
router.get("/", async (req, res) => {
  try {
    const {
      id,
      gender,
      phone,
      city,
      verified,
      profile_completed,
      fullname,
      state,
      gov_id_number,
      offer_ride,
      account_active,
    } = req.query;

    const baseUrl =
      process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;

    const conn = await pool.getConnection();

    let query = `SELECT 
      id,
      gender,
      phone,
      address,
      city,
      verified,
      profile_completed,
      fullname,
      dob,
      occupation,
      state,
      gov_id_number,
      offer_ride,
      profile_pic,
      gov_id_image,
      created_at,
      updated_at,
      account_active
    FROM users WHERE 1=1`;

    let params = [];

    if (id) {
      query += " AND id = ?";
      params.push(id);
    }

    if (gender) {
      query += " AND gender = ?";
      params.push(gender);
    }

    if (phone) {
      query += " AND phone LIKE ?";
      params.push(`%${phone}%`);
    }

    if (city) {
      query += " AND city LIKE ?";
      params.push(`%${city}%`);
    }

    if (verified !== undefined) {
      query += " AND verified = ?";
      params.push(verified);
    }

    if (profile_completed !== undefined) {
      query += " AND profile_completed = ?";
      params.push(profile_completed);
    }

    if (fullname) {
      query += " AND fullname LIKE ?";
      params.push(`%${fullname}%`);
    }

    if (state) {
      query += " AND state LIKE ?";
      params.push(`%${state}%`);
    }

    if (gov_id_number) {
      query += " AND gov_id_number LIKE ?";
      params.push(`%${gov_id_number}%`);
    }

    if (offer_ride !== undefined) {
      query += " AND offer_ride = ?";
      params.push(offer_ride);
    }

    if (account_active !== undefined) {
      query += " AND account_active = ?";
      params.push(account_active);
    }

    const [rows] = await conn.query(query, params);
    conn.release();

    const formattedRows = rows.map((r) => ({
      ...r,
      profile_pic: r.profile_pic
        ? `${baseUrl}/${r.profile_pic.replace(/\\/g, "/")}`
        : null,
      gov_id_image: r.gov_id_image
        ? `${baseUrl}/${r.gov_id_image.replace(/\\/g, "/")}`
        : null,
    }));

    return res.json({
      success: true,
      data: formattedRows,
      count: formattedRows.length,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch users",
      error: err.message,
    });
  }
});

// Get user by ID
router.get("/:id", async (req, res) => {
  try {
    const userId = req.params.id;
    const conn = await pool.getConnection();

    const query = `SELECT 
      id,
      gender,
      phone,
      address,
      city,
      verified,
      profile_completed,
      fullname,
      dob,
      occupation,
      state,
      gov_id_number,
      offer_ride,
      profile_pic,
      gov_id_image,
      created_at,
      updated_at,
      account_active
    FROM users WHERE id = ?`;

    const [rows] = await conn.query(query, [userId]);
    conn.release();

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.json({
      success: true,
      data: rows[0],
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch user",
      error: err.message,
    });
  }
});

// Update user status (verified, profile_completed, account_active, offer_ride)
router.put("/status/:id", async (req, res) => {
  try {
    const userId = req.params.id;
    const { verified, profile_completed, account_active, offer_ride } =
      req.body;

    // Check if at least one status field is provided
    if (
      verified === undefined &&
      profile_completed === undefined &&
      account_active === undefined &&
      offer_ride === undefined
    ) {
      return res.status(400).json({
        success: false,
        message:
          "At least one status field is required: verified, profile_completed, account_active, or offer_ride",
      });
    }

    const conn = await pool.getConnection();

    // Check if user exists
    const [checkRows] = await conn.query("SELECT id FROM users WHERE id = ?", [
      userId,
    ]);

    if (checkRows.length === 0) {
      conn.release();
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Build dynamic update query
    let updateFields = [];
    let updateParams = [];

    if (verified !== undefined) {
      updateFields.push("verified = ?");
      updateParams.push(verified);
    }

    if (profile_completed !== undefined) {
      updateFields.push("profile_completed = ?");
      updateParams.push(profile_completed);
    }

    if (account_active !== undefined) {
      updateFields.push("account_active = ?");
      updateParams.push(account_active);
    }

    if (offer_ride !== undefined) {
      updateFields.push("offer_ride = ?");
      updateParams.push(offer_ride);
    }

    updateParams.push(userId);

    const [result] = await conn.query(
      `UPDATE users SET ${updateFields.join(", ")} WHERE id = ?`,
      updateParams
    );

    conn.release();

    return res.json({
      success: true,
      message: "User status updated successfully",
      data: {
        id: userId,
        verified,
        profile_completed,
        account_active,
        offer_ride,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Failed to update user status",
      error: err.message,
    });
  }
});

// Update user profile information (name, email, phone, etc.)
router.put("/:id", async (req, res) => {
  try {
    const userId = req.params.id;
    const {
      fullname,
      phone,
      gender,
      address,
      city,
      dob,
      occupation,
      state,
      gov_id_number,
      profile_pic,
      gov_id_image,
    } = req.body;

    // Check if at least one field is provided
    if (
      !fullname &&
      !phone &&
      !gender &&
      !address &&
      !city &&
      !dob &&
      !occupation &&
      !state &&
      !gov_id_number &&
      !profile_pic &&
      !gov_id_image
    ) {
      return res.status(400).json({
        success: false,
        message: "At least one field is required to update",
      });
    }

    const conn = await pool.getConnection();

    // Check if user exists
    const [checkRows] = await conn.query("SELECT id FROM users WHERE id = ?", [
      userId,
    ]);

    if (checkRows.length === 0) {
      conn.release();
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Build dynamic update query
    let updateFields = [];
    let updateParams = [];

    if (fullname) {
      updateFields.push("fullname = ?");
      updateParams.push(fullname);
    }

    if (phone) {
      updateFields.push("phone = ?");
      updateParams.push(phone);
    }

    if (gender) {
      updateFields.push("gender = ?");
      updateParams.push(gender);
    }

    if (address) {
      updateFields.push("address = ?");
      updateParams.push(address);
    }

    if (city) {
      updateFields.push("city = ?");
      updateParams.push(city);
    }

    if (dob) {
      updateFields.push("dob = ?");
      updateParams.push(dob);
    }

    if (occupation) {
      updateFields.push("occupation = ?");
      updateParams.push(occupation);
    }

    if (state) {
      updateFields.push("state = ?");
      updateParams.push(state);
    }

    if (gov_id_number) {
      updateFields.push("gov_id_number = ?");
      updateParams.push(gov_id_number);
    }

    if (profile_pic) {
      updateFields.push("profile_pic = ?");
      updateParams.push(profile_pic);
    }

    if (gov_id_image) {
      updateFields.push("gov_id_image = ?");
      updateParams.push(gov_id_image);
    }

    updateParams.push(userId);

    const [result] = await conn.query(
      `UPDATE users SET ${updateFields.join(
        ", "
      )}, updated_at = NOW() WHERE id = ?`,
      updateParams
    );

    conn.release();

    return res.json({
      success: true,
      message: "User profile updated successfully",
      data: {
        id: userId,
        fullname,
        phone,
        gender,
        address,
        city,
        dob,
        occupation,
        state,
        gov_id_number,
        profile_pic,
        gov_id_image,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Failed to update user profile",
      error: err.message,
    });
  }
});

// Delete user
router.delete("/:id", async (req, res) => {
  try {
    const userId = req.params.id;
    const conn = await pool.getConnection();

    // Check if user exists
    const [checkRows] = await conn.query("SELECT id FROM users WHERE id = ?", [
      userId,
    ]);

    if (checkRows.length === 0) {
      conn.release();
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const [result] = await conn.query("DELETE FROM users WHERE id = ?", [
      userId,
    ]);

    conn.release();

    return res.json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Failed to delete user",
      error: err.message,
    });
  }
});

// Get user statistics
router.get("/stats/summary", async (req, res) => {
  try {
    const conn = await pool.getConnection();

    const query = `
      SELECT 
        COUNT(*) as total_users,
        SUM(verified = 1) as verified_users,
        SUM(profile_completed = 1) as profile_completed_users,
        SUM(account_active = 1) as active_users,
        SUM(offer_ride = 1) as ride_offer_users,
        COUNT(DISTINCT city) as cities_count,
        COUNT(DISTINCT state) as states_count
      FROM users
    `;

    const [rows] = await conn.query(query);
    conn.release();

    return res.json({
      success: true,
      data: rows[0],
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch user statistics",
      error: err.message,
    });
  }
});

module.exports = router;
