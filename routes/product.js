const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db/connection'); // adjust path if needed

// Multer storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = 'uploads/products';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({ storage, limits: { files: 5 } });

// Create Product
router.post('/product-create', upload.array('images', 5), (req, res) => {
  const { name, description, price, category, status = 'active' } = req.body;
  const images = req.files.map(file => file.filename);

  const product = {
    name,
    description,
    price,
    category,
    images: JSON.stringify(images),
    status
  };

  db.query('INSERT INTO products SET ?', product, (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Product created', id: result.insertId });
  });
});

router.get('/product-list', (req, res) => {
    db.query('SELECT * FROM products ORDER BY id DESC', (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(results);
    });
  });

  
  router.put('/product-update/:id', upload.array('images', 5), (req, res) => {
    const { id } = req.params;
    const { name, description, price, category, status } = req.body;
    let updatedData = { name, description, price, category, status };
  
    if (req.files && req.files.length > 0) {
      const images = req.files.map(file => file.filename);
      updatedData.images = JSON.stringify(images);
    }
  
    db.query('UPDATE products SET ? WHERE id = ?', [updatedData, id], (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Product updated' });
    });
  });

  
  router.delete('/product-delete/:id', (req, res) => {
    const { id } = req.params;
    db.query('DELETE FROM products WHERE id = ?', [id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Product deleted' });
    });
  });

  
  router.patch('/product-status/:id', (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    db.query('UPDATE products SET status = ? WHERE id = ?', [status, id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Status updated' });
    });
  });

  

  router.get('/orders-list', (req, res) => {
    db.query('SELECT * FROM orders ORDER BY id DESC', (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(results);
    });
  });

  router.post('/cms-page-update', (req, res) => {
    const { slug, user_type, description, status = 1 } = req.body;
  
    const checkSql = 'SELECT * FROM cms_pages WHERE slug = ? AND user_type = ?';
    db.query(checkSql, [slug, user_type], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
  
      if (rows.length > 0) {
        // Update existing
        const updateSql = 'UPDATE cms_pages SET description = ?, status = ? WHERE slug = ? AND user_type = ?';
        db.query(updateSql, [description, status, slug, user_type], (err) => {
          if (err) return res.status(500).json({ error: err.message });
          return res.json({ message: 'CMS content updated successfully' });
        });
      } else {
        // Insert new
        const insertSql = 'INSERT INTO cms_pages (slug, user_type, description, status) VALUES (?, ?, ?, ?)';
        db.query(insertSql, [slug, user_type, description, status], (err) => {
          if (err) return res.status(500).json({ error: err.message });
          return res.json({ message: 'CMS content created successfully' });
        });
      }
    });
  });

  
  router.get('/cms-page/:slug/:user_type', (req, res) => {
    const { slug, user_type } = req.params;
    const sql = 'SELECT * FROM cms_pages WHERE slug = ? AND user_type = ?';
    db.query(sql, [slug, user_type], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      if (rows.length === 0) return res.status(404).json({ message: 'Content not found' });
      res.json(rows[0]);
    });
  });
  

  module.exports = router;

  
