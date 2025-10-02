const express = require("express");
const router = express.Router();
const pool = require("../db/connection.js");
const authenticateToken = require("../middleware/auth.js");
const upload = require("../middleware/upload.js");

// --- Get Account ---
router.get("/", authenticateToken, async (req, res) => {
  const { phone } = req.user;
  const conn = await pool.getConnection();
  try {
    const [[user]] = await conn.query("SELECT * FROM users WHERE phone=?", [
      phone,
    ]);
    if (!user) return res.status(404).json({ msg: "User not found" });

    const [[account]] = await conn.query(
      "SELECT * FROM accounts WHERE user_id=?",
      [user.id]
    );

    if (!account) {
      return res.status(404).json({ msg: "No account found" });
    }

    res.json({ account });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ msg: "Failed to fetch account", error: err.message });
  } finally {
    conn.release();
  }
});

// --- Update (or Create) Account ---
router.put(
  "/update-account",
  authenticateToken,
  upload.none(),
  async (req, res) => {
    const { phone } = req.user;

    const { account_holder_name, bank_name, account_number, ifsc_code, branch_name } =
      req.body;

    const conn = await pool.getConnection();
    try {
      const [[user]] = await conn.query("SELECT * FROM users WHERE phone=?", [
        phone,
      ]);
      if (!user) return res.status(404).json({ msg: "User not found" });

      // Check if account already exists
      const [[existing]] = await conn.query(
        "SELECT * FROM accounts WHERE user_id=?",
        [user.id]
      );

      if (existing) {
        // Update existing account
        const [result] = await conn.query(
          `UPDATE accounts SET account_holder_name=?, bank_name=?, account_number=?, ifsc_code=?, branch_name=? WHERE user_id=?`,
          [account_holder_name, bank_name, account_number, ifsc_code, branch_name, user.id]
        );

        if (result.affectedRows === 0) {
          return res.status(404).json({ msg: "Account not found for update" });
        }

        return res.json({ msg: "Account updated successfully" });
      } else {
        // Create new account
        await conn.query(
          `INSERT INTO accounts (user_id, account_holder_name, bank_name, account_number, ifsc_code, branch_name) VALUES (?, ?, ?, ?, ?)`,
          [
            user.id,
            account_holder_name,
            bank_name,
            account_number,
            ifsc_code,
            branch_name,
          ]
        );

        return res.json({ msg: "Account created successfully" });
      }
    } catch (err) {
      console.error(err);
      res
        .status(500)
        .json({ msg: "Failed to save account", error: err.message });
    } finally {
      conn.release();
    }
  }
);

module.exports = router;
