const express = require("express");
const router = express.Router();
const pool = require("../db/connection.js");
const authenticateToken = require("../middleware/auth.js");
const upload = require("../middleware/upload.js");
const sendPushNotification = require("../utils/pushNotification.js");
const { promisePool } = require("../db/connection.js");

/**
 * POST /api/reviews
 * Create review (RIDER ↔ PASSENGER)
 */
router.post("/", authenticateToken, async (req, res) => {
  const phone = req.user.phone;
  const { ride_id, rating, comment } = req.body;

  if (!ride_id || !rating) {
    return res.status(400).json({ msg: "ride_id and rating are required" });
  }

  try {
    // 1️⃣ Get user ID from phone
    const [[user]] = await pool.query(
      "SELECT id FROM users WHERE phone = ? LIMIT 1",
      [phone]
    );

    if (!user) {
      return res.status(401).json({ msg: "User not found" });
    }

    const userId = user.id;

    // 2️⃣ Get ride
    const [[ride]] = await pool.query(
      "SELECT id, user_id, ride_status FROM rides WHERE id = ? LIMIT 1",
      [ride_id]
    );

    if (!ride) {
      return res.status(404).json({ msg: "Ride not found" });
    }

    if (ride.ride_status !== "completed") {
      return res.status(400).json({ msg: "Ride not completed yet" });
    }

    let reviewerRole, revieweeRole, revieweeId;

    // 3️⃣ User is RIDER (ride owner)
    if (Number(ride.user_id) === Number(userId)) {
      reviewerRole = "RIDER";
      revieweeRole = "PASSENGER";

      const [[passenger]] = await pool.query(
        `
        SELECT passenger_id
        FROM ride_requests
        WHERE ride_id = ?
          AND status = 'completed'
        LIMIT 1
        `,
        [ride_id]
      );

      if (!passenger) {
        return res.status(400).json({ msg: "No accepted passenger found" });
      }

      revieweeId = passenger.passenger_id;
    }
    // 4️⃣ User is PASSENGER
    else {
      reviewerRole = "PASSENGER";
      revieweeRole = "RIDER";

      const [[request]] = await pool.query(
        `
        SELECT id
        FROM ride_requests
        WHERE ride_id = ?
          AND passenger_id = ?
          AND status = 'completed'
        LIMIT 1
        `,
        [ride_id, userId]
      );

      if (!request) {
        return res.status(403).json({
          msg: "You are not allowed to review this ride",
        });
      }

      revieweeId = ride.user_id;
    }

    // 🚫 Prevent self review
    if (Number(userId) === Number(revieweeId)) {
      return res.status(400).json({ msg: "You cannot review yourself" });
    }

    // 5️⃣ Prevent duplicate review
    const [[existing]] = await pool.query(
      `
      SELECT id
      FROM reviews
      WHERE ride_id = ?
        AND reviewer_id = ?
        AND reviewer_role = ?
      LIMIT 1
      `,
      [ride_id, userId, reviewerRole]
    );

    if (existing) {
      return res.status(409).json({ msg: "Review already submitted" });
    }

    // 6️⃣ Insert review
    await pool.query(
      `
      INSERT INTO reviews
      (ride_id, reviewer_id, reviewer_role, reviewee_id, reviewee_role, rating, comment)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        ride_id,
        userId,
        reviewerRole,
        revieweeId,
        revieweeRole,
        rating,
        comment || null,
      ]
    );

    res.status(201).json({ msg: "Review submitted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      msg: "Failed to submit review",
      error: err.message,
    });
  }
});

/**
 * GET /api/reviews/me
 * Get my ratings as RIDER & PASSENGER
 */
router.get("/me", authenticateToken, async (req, res) => {
  const phone = req.user.phone;

  try {
    // 1️⃣ Get user ID
    const [[user]] = await pool.query(
      "SELECT id FROM users WHERE phone = ? LIMIT 1",
      [phone]
    );

    if (!user) {
      return res.status(401).json({ msg: "User not found" });
    }

    const userId = user.id;

    // 2️⃣ Reviews received as RIDER
    const [asRider] = await pool.query(
      `
      SELECT rating, comment, created_at
      FROM reviews
      WHERE reviewee_id = ?
        AND reviewee_role = 'RIDER'
      ORDER BY created_at DESC
      `,
      [userId]
    );

    // 3️⃣ Reviews received as PASSENGER
    const [asPassenger] = await pool.query(
      `
      SELECT rating, comment, created_at
      FROM reviews
      WHERE reviewee_id = ?
        AND reviewee_role = 'PASSENGER'
      ORDER BY created_at DESC
      `,
      [userId]
    );

    // 4️⃣ Averages
    const [[riderAvg]] = await pool.query(
      `
      SELECT ROUND(AVG(rating),1) AS avg_rating
      FROM reviews
      WHERE reviewee_id = ?
        AND reviewee_role = 'RIDER'
      `,
      [userId]
    );

    const [[passengerAvg]] = await pool.query(
      `
      SELECT ROUND(AVG(rating),1) AS avg_rating
      FROM reviews
      WHERE reviewee_id = ?
        AND reviewee_role = 'PASSENGER'
      `,
      [userId]
    );

    res.json({
      as_rider: {
        average_rating: riderAvg.avg_rating || 0,
        reviews: asRider,
      },
      as_passenger: {
        average_rating: passengerAvg.avg_rating || 0,
        reviews: asPassenger,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      msg: "Failed to fetch reviews",
      error: err.message,
    });
  }
});

/**
 * GET /api/reviews/user/:userId
 * Get ratings of any user (public profile)
 */
router.get("/user/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    // Check user exists
    const [[user]] = await promisePool.query(
      "SELECT id FROM users WHERE id = ? LIMIT 1",
      [userId]
    );

    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }

    const [reviews] = await promisePool.query(
      `
      SELECT rating, comment, reviewee_role, created_at
      FROM reviews
      WHERE reviewee_id = ?
      ORDER BY created_at DESC
      `,
      [userId]
    );

    res.json({
      user_id: userId,
      reviews,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      msg: "Failed to fetch user reviews",
      error: err.message,
    });
  }
});

module.exports = router;
