const express = require("express");
const router = express.Router();
const { pool } = require("../db/connection.js");
const authenticateToken = require("../middleware/auth.js");
const upload = require("../middleware/upload.js");



router.post(
    "/driver/bank-details",
    authenticateToken,
    async (req, res) => {
      try {
        const { phone } = req.user;
        const conn = await pool.getConnection();
        const [[user]] = await conn.query("SELECT * FROM users WHERE phone=?", [
            phone,
          ]);
    
          if (!user) {
            return res.status(404).json({
              success: false,
              message: "User not found",
            });
          }
        const driver_id = user.id;
  
        const {
          account_holder_name,
          bank_name,
          account_number,
          ifsc_code,
          branch_name,
        } = req.body;
  
        if (
          !account_holder_name ||
          !bank_name ||
          !account_number ||
          !ifsc_code
        ) {
          return res.status(400).json({
            success: false,
            msg: "Account holder name, bank name, account number and IFSC are required",
          });
        }
  
        // Check existing
        const [[existing]] = await pool.query(
          `SELECT id
           FROM driver_bank_details
           WHERE driver_id = ?
           AND status = 'active'
           LIMIT 1`,
          [driver_id]
        );
  
        if (existing) {
          return res.status(400).json({
            success: false,
            msg: "Bank details already exist. Please edit existing details.",
          });
        }
  
        const [result] = await pool.query(
          `INSERT INTO driver_bank_details
          (
            driver_id,
            account_holder_name,
            bank_name,
            account_number,
            ifsc_code,
            branch_name,
            is_primary,
            status
          )
          VALUES (?, ?, ?, ?, ?, ?, 1, 'active')`,
          [
            driver_id,
            account_holder_name,
            bank_name,
            account_number,
            ifsc_code.toUpperCase(),
            branch_name || null,
          ]
        );
  
        return res.status(200).json({
          success: true,
          msg: "Bank details added successfully",
          data: {
            id: result.insertId,
          },
        });
      } catch (err) {
        console.error("Add bank details error:", err);
  
        return res.status(500).json({
          success: false,
          msg: "Failed to add bank details",
          error: err.message,
        });
      }
    }
  );

  router.get(
    "/driver/bank-details",
    authenticateToken,
    async (req, res) => {
      try {
        const { phone } = req.user;
        const conn = await pool.getConnection();
        const [[user]] = await conn.query("SELECT * FROM users WHERE phone=?", [
            phone,
          ]);
    
          if (!user) {
            return res.status(404).json({
              success: false,
              message: "User not found",
            });
          }
        const driver_id = user.id;
  
        const [rows] = await pool.query(
          `SELECT
            id,
            account_holder_name,
            bank_name,
            account_number,
            ifsc_code,
            branch_name,
            is_primary,
            status,
            created_at,
            updated_at
           FROM driver_bank_details
           WHERE driver_id = ?
           AND status = 'active'
           ORDER BY is_primary DESC, id DESC`,
          [driver_id]
        );
  
        const data = rows.map((bank) => {
          const account = String(bank.account_number);
  
          return {
            ...bank,
            account_number:
              account.length > 4
                ? "XXXXXX" + account.slice(-4)
                : account,
          };
        });
  
        return res.status(200).json({
          success: true,
          msg: "Bank details fetched successfully",
          data,
        });
      } catch (err) {
        console.error("Bank list error:", err);
  
        return res.status(500).json({
          success: false,
          msg: "Failed to fetch bank details",
          error: err.message,
        });
      }
    }
  );

  router.get(
    "/driver/bank-details/:id",
    authenticateToken,
    async (req, res) => {
      try {
        const { phone } = req.user;
        const conn = await pool.getConnection();
        const [[user]] = await conn.query("SELECT * FROM users WHERE phone=?", [
            phone,
          ]);
    
          if (!user) {
            return res.status(404).json({
              success: false,
              message: "User not found",
            });
          }
        const driver_id = user.id;
        const bank_id = req.params.id;
  
        const [[bank]] = await pool.query(
          `SELECT
            id,
            account_holder_name,
            bank_name,
            account_number,
            ifsc_code,
            branch_name,
            is_primary,
            status
           FROM driver_bank_details
           WHERE id = ?
           AND driver_id = ?`,
          [bank_id, driver_id]
        );
  
        if (!bank) {
          return res.status(404).json({
            success: false,
            msg: "Bank details not found",
          });
        }
  
        const account = String(bank.account_number);
  
        bank.account_number =
          account.length > 4
            ? "XXXXXX" + account.slice(-4)
            : account;
  
        return res.status(200).json({
          success: true,
          msg: "Bank details fetched successfully",
          data: bank,
        });
      } catch (err) {
        console.error("Get bank error:", err);
  
        return res.status(500).json({
          success: false,
          msg: "Failed to get bank details",
          error: err.message,
        });
      }
    }
  );

  router.get(
    "/admin/driver-settlements/:id",
  //  authenticateToken,
    async (req, res) => {
  
      const settlementId = req.params.id;
  
      let conn;
  
      try {
  
        conn = await pool.getConnection();
  
        const [[settlement]] = await conn.query(
          `SELECT
              ds.*,
  
              driver.fullname AS driver_name,
              driver.phone AS driver_phone,
  
              rr.ride_id,
              rr.passenger_id,
              rr.pickup_stop,
              rr.no_of_seats,
              rr.estimated_amount,
              rr.payment_status
  
           FROM driver_settlements ds
  
           LEFT JOIN users driver
             ON driver.id = ds.driver_id
  
           LEFT JOIN ride_requests rr
             ON rr.id = ds.ride_request_id
  
           WHERE ds.id = ?`,
          [settlementId]
        );
  
        if (!settlement) {
          return res.status(404).json({
            success: false,
            msg: "Settlement not found"
          });
        }
  
        return res.status(200).json({
          success: true,
          msg: "Settlement details fetched successfully",
          data: settlement
        });
  
      } catch (err) {
  
        console.error(
          "❌ Settlement detail error:",
          err
        );
  
        return res.status(500).json({
          success: false,
          msg: "Failed to fetch settlement",
          error: err.sqlMessage || err.message
        });
  
      } finally {
  
        if (conn) {
          conn.release();
        }
  
      }
    }
  );

  // ==========================================
// ADMIN - UPDATE SUBSCRIPTION PLAN
// PUT /api/admin/subscription-plans/:id
// ==========================================

router.put(
  "/admin/subscription-plans/:id",
  authenticateToken,
  async (req, res) => {

    const planId = req.params.id;

    const {
      name,
      description,
      price,
      no_of_rides,
      validity_days,
      status
    } = req.body;

    // ------------------------------------------
    // Validation
    // ------------------------------------------

    if (
      !name ||
      price === undefined ||
      no_of_rides === undefined ||
      validity_days === undefined
    ) {
      return res.status(400).json({
        success: false,
        msg: "name, price, no_of_rides and validity_days are required"
      });
    }

    if (Number(price) <= 0) {
      return res.status(400).json({
        success: false,
        msg: "Price must be greater than 0"
      });
    }

    if (Number(no_of_rides) <= 0) {
      return res.status(400).json({
        success: false,
        msg: "Number of rides must be greater than 0"
      });
    }

    if (Number(validity_days) <= 0) {
      return res.status(400).json({
        success: false,
        msg: "Validity days must be greater than 0"
      });
    }

    const planStatus = status || "active";

    if (!["active", "inactive"].includes(planStatus)) {
      return res.status(400).json({
        success: false,
        msg: "Invalid status. Use active or inactive"
      });
    }

    let conn;

    try {

      conn = await pool.getConnection();

      // ------------------------------------------
      // 1. Check plan exists
      // ------------------------------------------

      const [[plan]] = await conn.query(
        `SELECT *
         FROM subscription_plans
         WHERE id = ?`,
        [planId]
      );

      if (!plan) {
        return res.status(404).json({
          success: false,
          msg: "Subscription plan not found"
        });
      }

      // ------------------------------------------
      // 2. Check duplicate name
      // ------------------------------------------

      const [[duplicate]] = await conn.query(
        `SELECT id
         FROM subscription_plans
         WHERE name = ?
         AND id != ?
         LIMIT 1`,
        [
          name.trim(),
          planId
        ]
      );

      if (duplicate) {
        return res.status(400).json({
          success: false,
          msg: "Another subscription plan with this name already exists"
        });
      }

      // ------------------------------------------
      // 3. Update plan
      // ------------------------------------------

      await conn.query(
        `UPDATE subscription_plans
         SET
           name = ?,
           description = ?,
           price = ?,
           no_of_rides = ?,
           validity_days = ?,
           status = ?
         WHERE id = ?`,
        [
          name.trim(),
          description || null,
          Number(price),
          Number(no_of_rides),
          Number(validity_days),
          planStatus,
          planId
        ]
      );

      // ------------------------------------------
      // 4. Get updated plan
      // ------------------------------------------

      const [[updatedPlan]] = await conn.query(
        `SELECT
           id,
           name,
           description,
           price,
           no_of_rides,
           validity_days,
           status,
           created_at,
           updated_at
         FROM subscription_plans
         WHERE id = ?`,
        [planId]
      );

      return res.status(200).json({
        success: true,
        msg: "Subscription plan updated successfully",
        data: updatedPlan
      });

    } catch (err) {

      console.error(
        "❌ Update subscription plan error:",
        err
      );

      return res.status(500).json({
        success: false,
        msg: "Failed to update subscription plan",
        error: err.sqlMessage || err.message
      });

    } finally {

      if (conn) {
        conn.release();
      }

    }
  }
);

  router.get(
    "/admin/driver-settlements",
   // authenticateToken,
    async (req, res) => {
  
      let conn;
  
      try {
  
        conn = await pool.getConnection();
  
        const [rows] = await conn.query(
          `SELECT
              ds.id,
              ds.driver_id,
              driver.fullname AS driver_name,
              driver.phone AS driver_phone,
  
              ds.ride_request_id,
  
              ds.gross_amount,
              ds.commission_amount,
              ds.driver_amount,
  
              ds.status,
              ds.payment_reference,
              ds.paid_at,
              ds.notes,
  
              ds.created_at,
              ds.updated_at
  
           FROM driver_settlements ds
  
           LEFT JOIN users driver
             ON driver.id = ds.driver_id
  
           ORDER BY ds.id DESC`
        );
  
        return res.status(200).json({
          success: true,
          msg: "Driver settlements fetched successfully",
          data: rows
        });
  
      } catch (err) {
  
        console.error(
          "❌ Get settlements error:",
          err
        );
  
        return res.status(500).json({
          success: false,
          msg: "Failed to fetch driver settlements",
          error: err.sqlMessage || err.message
        });
  
      } finally {
  
        if (conn) {
          conn.release();
        }
  
      }
    }
  );

  router.patch(
    "/admin/driver-settlements/:id/paid",
   // authenticateToken,
    async (req, res) => {
  
      const settlementId = req.params.id;
  
      const {
        payment_reference,
        notes
      } = req.body;
  
      if (!payment_reference) {
        return res.status(400).json({
          success: false,
          msg: "Payment reference is required"
        });
      }
  
      let conn;
  
      try {
  
        conn = await pool.getConnection();
  
        await conn.beginTransaction();
  
        // ==========================================
        // 1. Get settlement
        // ==========================================
  
        const [[settlement]] = await conn.query(
          `SELECT *
           FROM driver_settlements
           WHERE id = ?
           FOR UPDATE`,
          [settlementId]
        );
  
        if (!settlement) {
  
          await conn.rollback();
  
          return res.status(404).json({
            success: false,
            msg: "Settlement not found"
          });
        }
  
        // ==========================================
        // 2. Check already paid
        // ==========================================
  
        if (settlement.status === "paid") {
  
          await conn.rollback();
  
          return res.status(400).json({
            success: false,
            msg: "Settlement is already marked as paid"
          });
        }
  
        // ==========================================
        // 3. Update settlement
        // ==========================================
  
        await conn.query(
          `UPDATE driver_settlements
           SET
             status = 'paid',
             payment_reference = ?,
             paid_at = NOW(),
             notes = ?
           WHERE id = ?`,
          [
            payment_reference,
            notes || null,
            settlementId
          ]
        );
  
        await conn.commit();
  
        // ==========================================
        // 4. Get updated settlement
        // ==========================================
  
        const [[updatedSettlement]] = await conn.query(
          `SELECT
              ds.id,
              ds.driver_id,
              u.fullname AS driver_name,
              u.phone AS driver_phone,
              ds.ride_request_id,
              ds.gross_amount,
              ds.commission_amount,
              ds.driver_amount,
              ds.status,
              ds.payment_reference,
              ds.paid_at,
              ds.notes,
              ds.created_at,
              ds.updated_at
           FROM driver_settlements ds
           LEFT JOIN users u
             ON u.id = ds.driver_id
           WHERE ds.id = ?`,
          [settlementId]
        );
  
        return res.status(200).json({
          success: true,
          msg: "Driver settlement marked as paid",
          data: updatedSettlement
        });
  
      } catch (err) {
  
        if (conn) {
          await conn.rollback();
        }
  
        console.error(
          "❌ Mark settlement paid error:",
          err
        );
  
        return res.status(500).json({
          success: false,
          msg: "Failed to mark settlement as paid",
          error: err.sqlMessage || err.message
        });
  
      } finally {
  
        if (conn) {
          conn.release();
        }
  
      }
    }
  );

router.get(
  "/driver/bank-details/:id",
  authenticateToken,
  async (req, res) => {
    try {
        const { phone } = req.user;
        const conn = await pool.getConnection();
        const [[user]] = await conn.query("SELECT * FROM users WHERE phone=?", [
            phone,
          ]);
    
          if (!user) {
            return res.status(404).json({
              success: false,
              message: "User not found",
            });
          }
        const driver_id = user.id;
      const bank_id = req.params.id;

      const [[bank]] = await pool.query(
        `SELECT
          id,
          account_holder_name,
          bank_name,
          account_number,
          ifsc_code,
          branch_name,
          is_primary,
          status
         FROM driver_bank_details
         WHERE id = ?
         AND driver_id = ?`,
        [bank_id, driver_id]
      );

      if (!bank) {
        return res.status(404).json({
          success: false,
          msg: "Bank details not found",
        });
      }

      const account = String(bank.account_number);

      bank.account_number =
        account.length > 4
          ? "XXXXXX" + account.slice(-4)
          : account;

      return res.status(200).json({
        success: true,
        msg: "Bank details fetched successfully",
        data: bank,
      });
    } catch (err) {
      console.error("Get bank error:", err);

      return res.status(500).json({
        success: false,
        msg: "Failed to get bank details",
        error: err.message,
      });
    }
  }
);


router.get(
  "/driver/bank-details/:id",
  authenticateToken,
  async (req, res) => {
    try {
        const { phone } = req.user;
        const conn = await pool.getConnection();
        const [[user]] = await conn.query("SELECT * FROM users WHERE phone=?", [
            phone,
          ]);
    
          if (!user) {
            return res.status(404).json({
              success: false,
              message: "User not found",
            });
          }
        const driver_id = user.id;
      const bank_id = req.params.id;

      const [[bank]] = await pool.query(
        `SELECT
          id,
          account_holder_name,
          bank_name,
          account_number,
          ifsc_code,
          branch_name,
          is_primary,
          status
         FROM driver_bank_details
         WHERE id = ?
         AND driver_id = ?`,
        [bank_id, driver_id]
      );

      if (!bank) {
        return res.status(404).json({
          success: false,
          msg: "Bank details not found",
        });
      }

      const account = String(bank.account_number);

      bank.account_number =
        account.length > 4
          ? "XXXXXX" + account.slice(-4)
          : account;

      return res.status(200).json({
        success: true,
        msg: "Bank details fetched successfully",
        data: bank,
      });
    } catch (err) {
      console.error("Get bank error:", err);

      return res.status(500).json({
        success: false,
        msg: "Failed to get bank details",
        error: err.message,
      });
    }
  }
);


router.get(
  "/driver/bank-details/:id",
  authenticateToken,
  async (req, res) => {
    try {
        const { phone } = req.user;
        const conn = await pool.getConnection();
        const [[user]] = await conn.query("SELECT * FROM users WHERE phone=?", [
            phone,
          ]);
    
          if (!user) {
            return res.status(404).json({
              success: false,
              message: "User not found",
            });
          }
        const driver_id = user.id;
      const bank_id = req.params.id;

      const [[bank]] = await pool.query(
        `SELECT
          id,
          account_holder_name,
          bank_name,
          account_number,
          ifsc_code,
          branch_name,
          is_primary,
          status
         FROM driver_bank_details
         WHERE id = ?
         AND driver_id = ?`,
        [bank_id, driver_id]
      );

      if (!bank) {
        return res.status(404).json({
          success: false,
          msg: "Bank details not found",
        });
      }

      const account = String(bank.account_number);

      bank.account_number =
        account.length > 4
          ? "XXXXXX" + account.slice(-4)
          : account;

      return res.status(200).json({
        success: true,
        msg: "Bank details fetched successfully",
        data: bank,
      });
    } catch (err) {
      console.error("Get bank error:", err);

      return res.status(500).json({
        success: false,
        msg: "Failed to get bank details",
        error: err.message,
      });
    }
  }
);

router.put(
    "/driver/bank-details/:id",
    authenticateToken,
    async (req, res) => {
      try {
        const { phone } = req.user;
        const conn = await pool.getConnection();
        const [[user]] = await conn.query("SELECT * FROM users WHERE phone=?", [
            phone,
          ]);
    
          if (!user) {
            return res.status(404).json({
              success: false,
              message: "User not found",
            });
          }
        const driver_id = user.id;
        const bank_id = req.params.id;
  
        const {
          account_holder_name,
          bank_name,
          account_number,
          ifsc_code,
          branch_name,
        } = req.body;
  
        if (
          !account_holder_name ||
          !bank_name ||
          !account_number ||
          !ifsc_code
        ) {
          return res.status(400).json({
            success: false,
            msg: "Account holder name, bank name, account number and IFSC are required",
          });
        }
  
        const [[bank]] = await pool.query(
          `SELECT id
           FROM driver_bank_details
           WHERE id = ?
           AND driver_id = ?
           AND status = 'active'`,
          [bank_id, driver_id]
        );
  
        if (!bank) {
          return res.status(404).json({
            success: false,
            msg: "Bank details not found",
          });
        }
  
        await pool.query(
          `UPDATE driver_bank_details
           SET
             account_holder_name = ?,
             bank_name = ?,
             account_number = ?,
             ifsc_code = ?,
             branch_name = ?
           WHERE id = ?
           AND driver_id = ?`,
          [
            account_holder_name,
            bank_name,
            account_number,
            ifsc_code.toUpperCase(),
            branch_name || null,
            bank_id,
            driver_id,
          ]
        );
  
        return res.status(200).json({
          success: true,
          msg: "Bank details updated successfully",
        });
      } catch (err) {
        console.error("Edit bank error:", err);
  
        return res.status(500).json({
          success: false,
          msg: "Failed to update bank details",
          error: err.message,
        });
      }
    }
  );


  router.delete(
    "/driver/bank-details/:id",
    authenticateToken,
    async (req, res) => {
      try {
        const { phone } = req.user;
        const conn = await pool.getConnection();
        const [[user]] = await conn.query("SELECT * FROM users WHERE phone=?", [
            phone,
          ]);
    
          if (!user) {
            return res.status(404).json({
              success: false,
              message: "User not found",
            });
          }
        const driver_id = user.id;
        const bank_id = req.params.id;
  
        const [result] = await pool.query(
          `UPDATE driver_bank_details
           SET status = 'inactive'
           WHERE id = ?
           AND driver_id = ?`,
          [bank_id, driver_id]
        );
  
        if (result.affectedRows === 0) {
          return res.status(404).json({
            success: false,
            msg: "Bank details not found",
          });
        }
  
        return res.status(200).json({
          success: true,
          msg: "Bank details deleted successfully",
        });
      } catch (err) {
        console.error("Delete bank error:", err);
  
        return res.status(500).json({
          success: false,
          msg: "Failed to delete bank details",
          error: err.message,
        });
      }
    }
  );

  module.exports = router;

