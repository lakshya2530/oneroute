
const crypto = require("crypto");
const express = require("express");
const router = express.Router();
const { pool } = require("../db/connection.js");
const authenticateToken = require("../middleware/auth.js");
const upload = require("../middleware/upload.js");
const razorpay = require("../config/razorpay");




router.get("/subscription-plans", authenticateToken, async (req, res) => {
    try {
      const [plans] = await pool.query(
        `SELECT
          id,
          name,
          description,
          price,
          no_of_rides,
          validity_days,
          status,
          created_at
         FROM subscription_plans
         WHERE status = 'active'
         ORDER BY price ASC`
      );
  
      return res.status(200).json({
        success: true,
        msg: "Subscription plans fetched successfully",
        data: plans,
      });
    } catch (err) {
      console.error("Subscription plans error:", err);
  
      return res.status(500).json({
        success: false,
        msg: "Failed to fetch subscription plans",
        error: err.message,
      });
    }
  });



  router.get(
    "/subscription-plans/:id",
    authenticateToken,
    async (req, res) => {
      try {
        const { id } = req.params;
  
        const [[plan]] = await pool.query(
          `SELECT
            id,
            name,
            description,
            price,
            no_of_rides,
            validity_days,
            status
           FROM subscription_plans
           WHERE id = ?
           AND status = 'active'`,
          [id]
        );
  
        if (!plan) {
          return res.status(404).json({
            success: false,
            msg: "Subscription plan not found",
          });
        }
  
        return res.status(200).json({
          success: true,
          msg: "Subscription plan fetched successfully",
          data: plan,
        });
      } catch (err) {
        console.error("Get subscription plan error:", err);
  
        return res.status(500).json({
          success: false,
          msg: "Failed to get subscription plan",
          error: err.message,
        });
      }
    }
  );

  router.get(
    "/subscription-plans/:id",
    authenticateToken,
    async (req, res) => {
      try {
        const { id } = req.params;
  
        const [[plan]] = await pool.query(
          `SELECT
            id,
            name,
            description,
            price,
            no_of_rides,
            validity_days,
            status
           FROM subscription_plans
           WHERE id = ?
           AND status = 'active'`,
          [id]
        );
  
        if (!plan) {
          return res.status(404).json({
            success: false,
            msg: "Subscription plan not found",
          });
        }
  
        return res.status(200).json({
          success: true,
          msg: "Subscription plan fetched successfully",
          data: plan,
        });
      } catch (err) {
        console.error("Get subscription plan error:", err);
  
        return res.status(500).json({
          success: false,
          msg: "Failed to get subscription plan",
          error: err.message,
        });
      }
    }
  );

  router.post(
    "/subscription-plans/payment/verify",
    authenticateToken,
    async (req, res) => {
      let conn;
  
      try {
        const driver_id = req.user.id;
  
        const {
          subscription_id,
          razorpay_order_id,
          razorpay_payment_id,
          razorpay_signature,
        } = req.body;
  
        if (
          !subscription_id ||
          !razorpay_order_id ||
          !razorpay_payment_id ||
          !razorpay_signature
        ) {
          return res.status(400).json({
            success: false,
            msg: "Missing payment details",
          });
        }
  
        const generatedSignature = crypto
          .createHmac(
            "sha256",
            process.env.RAZORPAY_KEY_SECRET
          )
          .update(
            razorpay_order_id + "|" + razorpay_payment_id
          )
          .digest("hex");
  
        if (generatedSignature !== razorpay_signature) {
          return res.status(400).json({
            success: false,
            msg: "Invalid payment signature",
          });
        }
  
        conn = await pool.getConnection();
  
        await conn.beginTransaction();
  
        const [[subscription]] = await conn.query(
          `SELECT *
           FROM driver_subscriptions
           WHERE id = ?
           AND driver_id = ?
           FOR UPDATE`,
          [subscription_id, driver_id]
        );
  
        if (!subscription) {
          await conn.rollback();
  
          return res.status(404).json({
            success: false,
            msg: "Subscription not found",
          });
        }
  
        if (subscription.status === "active") {
          await conn.rollback();
  
          return res.status(400).json({
            success: false,
            msg: "Subscription already activated",
          });
        }
  
        const startsAt = new Date();
  
        let expiresAt = null;
  
        if (subscription.validity_days) {
          expiresAt = new Date(startsAt);
          expiresAt.setDate(
            expiresAt.getDate() + Number(subscription.validity_days)
          );
        }
  
        await conn.query(
          `UPDATE driver_subscriptions
           SET
             payment_id = ?,
             status = 'active',
             total_rides = ?,
             used_rides = 0,
             remaining_rides = ?,
             starts_at = ?,
             expires_at = ?
           WHERE id = ?`,
          [
            razorpay_payment_id,
            subscription.total_rides,
            subscription.total_rides,
            startsAt,
            expiresAt,
            subscription_id,
          ]
        );
  
        await conn.commit();
  
        return res.status(200).json({
          success: true,
          msg: "Subscription activated successfully",
          data: {
            subscription_id: subscription.id,
            plan_name: subscription.plan_name,
            total_rides: subscription.total_rides,
            remaining_rides: subscription.total_rides,
            expires_at: expiresAt,
            payment_id: razorpay_payment_id,
          },
        });
      } catch (err) {
        if (conn) {
          await conn.rollback();
        }
  
        console.error("Subscription payment verification error:", err);
  
        return res.status(500).json({
          success: false,
          msg: "Payment verification failed",
          error: err.message,
        });
      } finally {
        if (conn) conn.release();
      }
    }
  );

  router.get(
    "/my-subscription",
    authenticateToken,
    async (req, res) => {
      try {
        const driver_id = req.user.id;
  
        // Expire old subscription
        await pool.query(
          `UPDATE driver_subscriptions
           SET status = 'expired'
           WHERE driver_id = ?
           AND status = 'active'
           AND expires_at IS NOT NULL
           AND expires_at < NOW()`,
          [driver_id]
        );
  
        const [[subscription]] = await pool.query(
          `SELECT
            id,
            plan_id,
            plan_name,
            amount,
            total_rides,
            used_rides,
            remaining_rides,
            starts_at,
            expires_at,
            status
           FROM driver_subscriptions
           WHERE driver_id = ?
           AND status = 'active'
           ORDER BY id DESC
           LIMIT 1`,
          [driver_id]
        );
  
        if (!subscription) {
          return res.status(200).json({
            success: true,
            msg: "No active subscription found",
            data: null,
          });
        }
  
        return res.status(200).json({
          success: true,
          msg: "Current subscription fetched successfully",
          data: subscription,
        });
      } catch (err) {
        console.error("My subscription error:", err);
  
        return res.status(500).json({
          success: false,
          msg: "Failed to fetch subscription",
          error: err.message,
        });
      }
    }
  );

  module.exports = router;

  