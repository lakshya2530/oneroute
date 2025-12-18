const express = require("express");
const router = express.Router();
const pool = require("../db/connection.js");
const jwt = require("jsonwebtoken");
const upload = require("../middleware/upload.js");
const authenticateToken = require("../middleware/auth.js");
const sendPushNotification = require("../utils/pushNotification");
const admin = require("../config/firebase");
// --- Add Vehicle ---
router.post(
  "/vehicles",
  authenticateToken,
  upload.single("vehicle_image"),
  async (req, res) => {
    const { phone } = req.user;
    const { vehicle_make, vehicle_model, vehicle_year, license_plate } =
      req.body;

    const conn = await pool.getConnection();
    try {
      const [[user]] = await conn.query("SELECT * FROM users WHERE phone=?", [
        phone,
      ]);
      if (!user) return res.status(404).json({ msg: "User not found" });

      await conn.query(
        "INSERT INTO vehicles (user_id, vehicle_make, vehicle_model, vehicle_year, license_plate, vehicle_image) VALUES (?, ?, ?, ?, ?, ?)",
        [
          user.id,
          vehicle_make,
          vehicle_model,
          vehicle_year,
          license_plate,
          req.file?.path || null,
        ]
      );

      const [[count]] = await conn.query(
        "SELECT COUNT(*) as total FROM vehicles WHERE user_id=?",
        [user.id]
      );
      if (count.total === 1 && !user.offer_ride) {
        await conn.query("UPDATE users SET offer_ride=? WHERE id=?", [
          true,
          user.id,
        ]);
      }

      res.json({ msg: "Vehicle added successfully" });
    } catch (err) {
      console.error(err);
      res
        .status(500)
        .json({ msg: "Failed to add vehicle", error: err.message });
    } finally {
      conn.release();
    }
  }
);

router.post("/test-push", async (req, res) => {
  try {
    const { token, title, body } = req.body;

    if (!token || !title || !body) {
      return res.status(400).json({ error: "token, title, and body are required" });
    }

    const message = {
      notification: { title, body },
      token: token, // single device token
    };

    const response = await admin.messaging().send(message);
    console.log("✅ Notification sent successfully:", response);

    res.json({
      success: true,
      message: "Notification sent successfully",
      response,
    });
  } catch (error) {
    console.error("❌ Notification error:", error);
    res.status(500).json({ error: error.message });
  }
});
// --- Get All Vehicles ---
router.get("/vehicles", authenticateToken, async (req, res) => {
  const { phone } = req.user;
  const conn = await pool.getConnection();
  try {
    const [[user]] = await conn.query("SELECT * FROM users WHERE phone=?", [
      phone,
    ]);
    if (!user) return res.status(404).json({ msg: "User not found" });

    const [vehicles] = await conn.query(
      "SELECT * FROM vehicles WHERE user_id=?",
      [user.id]
    );

    const baseUrl =
      process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;

    // Map over vehicles and prepend baseUrl to vehicle_image if exists
    const vehiclesWithFullUrl = vehicles.map((vehicle) => {
      return {
        ...vehicle,
        vehicle_image: vehicle.vehicle_image
          ? `${baseUrl}/${vehicle.vehicle_image}`
          : null,
      };
    });

    res.json({ vehicles: vehiclesWithFullUrl });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ msg: "Failed to fetch vehicles", error: err.message });
  } finally {
    conn.release();
  }
});


// --- Update Vehicle ---
router.put(
  "/vehicles/:id",
  authenticateToken,
  upload.single("vehicle_image"),
  async (req, res) => {
    const { phone } = req.user;
    const { id } = req.params;
    const { vehicle_make, vehicle_model, vehicle_year, license_plate } =
      req.body;

    const conn = await pool.getConnection();
    try {
      const [[user]] = await conn.query("SELECT * FROM users WHERE phone=?", [
        phone,
      ]);

      const [result] = await conn.query(
        `UPDATE vehicles SET vehicle_make=?, vehicle_model=?, vehicle_year=?, license_plate=?, vehicle_image=? 
         WHERE id=? AND user_id=?`,
        [
          vehicle_make,
          vehicle_model,
          vehicle_year,
          license_plate,
          req.file?.path || null,
          id,
          user.id,
        ]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ msg: "Vehicle not found" });
      }

      res.json({ msg: "Vehicle updated successfully" });
    } catch (err) {
      console.error(err);
      res
        .status(500)
        .json({ msg: "Failed to update vehicle", error: err.message });
    } finally {
      conn.release();
    }
  }
);

// --- Delete Vehicle ---
router.delete("/vehicles/:id", authenticateToken, async (req, res) => {
  const { phone } = req.user;
  const { id } = req.params;

  const conn = await pool.getConnection();
  try {
    const [[user]] = await conn.query("SELECT * FROM users WHERE phone=?", [
      phone,
    ]);

    const [result] = await conn.query(
      "DELETE FROM vehicles WHERE id=? AND user_id=?",
      [id, user.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ msg: "Vehicle not found or unauthorized" });
    }

    res.json({ msg: "Vehicle deleted successfully" });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ msg: "Failed to delete vehicle", error: err.message });
  } finally {
    conn.release();
  }
});

module.exports = router;
