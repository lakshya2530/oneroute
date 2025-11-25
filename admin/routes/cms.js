const express = require("express");
const router = express.Router();
const pool = require("../../db/connection.js");
const authenticateToken = require("../../middleware/auth.js");

router.get("/pages", async (req, res) => {
  try {
    const { slug } = req.query;

    const conn = await pool.getConnection();

    let query = "SELECT * FROM cms_pages WHERE status = 1";
    let params = [];

    if (slug) {
      query += " AND slug = ?";
      params.push(slug);
    }

    const [rows] = await conn.query(query, params);
    conn.release();

    return res.json({
      success: true,
      data: rows
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      msg: "Failed to fetch CMS pages",
      error: err.message,
    });
  }
});



router.post("/pages-save", async (req, res) => {
  const { slug, description, status } = req.body;

  // Validate required fields
  if (!slug || !status) {
    return res.status(400).json({
      success: false,
      msg: "slug, and status are required",
    });
  }

  try {
    const conn = await pool.getConnection();

    const query = `
      INSERT INTO cms_pages (slug, description, status)
      VALUES (?, ?, ?)
    `;

    const [result] = await conn.query(query, [
      slug,
      description || null,
      status,
    ]);

    conn.release();

    return res.json({
      success: true,
      msg: "CMS page created successfully",
      inserted_id: result.insertId,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      msg: "Failed to create CMS page",
      error: err.message,
    });
  }
});


router.put("/pages/:id", async (req, res) => {
  const { slug, user_type, description, status } = req.body;
  const { id } = req.params;

  try {
    const conn = await pool.getConnection();

    const query = `
      UPDATE cms_pages
      SET slug = ?, user_type = ?, description = ?, status = ?
      WHERE id = ?
    `;

    await conn.query(query, [
      slug,
      user_type,
      description || null,
      status,
      id,
    ]);

    conn.release();

    return res.json({
      success: true,
      msg: "CMS page updated successfully",
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      msg: "Failed to update CMS page",
      error: err.message,
    });
  }
});


module.exports = router;
