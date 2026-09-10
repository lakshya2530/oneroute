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

