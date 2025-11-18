const express = require("express");
const router = express.Router();
const pool = require("../../db/connection.js");
const authenticateToken = require("../../middleware/auth.js");

router.get("/", async (req, res) => {
  try {
    const conn = await pool.getConnection();
    const [rows] = await conn.query("SELECT * FROM commission_settings LIMIT 1");
    conn.release();

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No commission settings found",
      });
    }

    return res.json({
      success: true,
      data: rows[0],
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch settings",
      error: err.message,
    });
  }
});

/**
 * PUT — Update settings
 */
router.put("/", async (req, res) => {
  try {
    const { per_ride_commission, frequent_user_commission } = req.body;

    if (!per_ride_commission || !frequent_user_commission) {
      return res.status(400).json({
        success: false,
        message: "Both commission fields are required",
      });
    }

    const conn = await pool.getConnection();

    const [updateResult] = await conn.query(
      `
      UPDATE commission_settings 
      SET per_ride_commission = ?, frequent_user_commission = ?
      WHERE id = 1
      `,
      [per_ride_commission, frequent_user_commission]
    );

    const [rows] = await conn.query(
      `SELECT * FROM commission_settings WHERE id = 1`
    );

    conn.release();

    return res.json({
      success: true,
      message: "Commission settings updated successfully",
      data: rows[0],
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Failed to update settings",
      error: err.message,
    });
  }
});

module.exports = router;