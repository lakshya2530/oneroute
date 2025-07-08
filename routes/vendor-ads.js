const express = require('express');
const router = express.Router();
const path = require('path');
const multer = require('multer');
const db = require('../db/connection');
const authenticate = require('../middleware/auth');

// Multer setup
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/vendor_ads');
  },
  filename: function (req, file, cb) {
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueName + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// Create Ad
router.post('/vendor/ad-create', authenticate, upload.single('image'), (req, res) => {
  const vendor_id = req.user.id;
  const { image_link } = req.body;
  const image = req.file?.filename || '';

  const sql = 'INSERT INTO vendor_ads (vendor_id, image, image_link) VALUES (?, ?, ?)';
  db.query(sql, [vendor_id, image, image_link], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });

    res.json({
      message: 'Ad created successfully',
      id: result.insertId,
      image: `${req.protocol}://${req.get('host')}/uploads/vendor_ads/${image}`,
      image_link
    });
  });
});

// List Ads
router.get('/vendor/ad-list', authenticate, (req, res) => {
  const vendor_id = req.user.id;
  const sql = 'SELECT id, image, image_link, created_at FROM vendor_ads WHERE vendor_id = ? ORDER BY id DESC';

  db.query(sql, [vendor_id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });

    const formatted = results.map(ad => ({
      ...ad,
      image: `${req.protocol}://${req.get('host')}/uploads/vendor_ads/${ad.image}`
    }));

    res.json(formatted);
  });
});

// Edit Ad
router.put('/vendor/ad-update/:id', authenticate, upload.single('image'), (req, res) => {
  const vendor_id = req.user.id;
  const { id } = req.params;
  const { image_link } = req.body;
  const image = req.file?.filename;

  let updateFields = [];
  let values = [];

  if (image) {
    updateFields.push('image = ?');
    values.push(image);
  }

  if (image_link) {
    updateFields.push('image_link = ?');
    values.push(image_link);
  }

  if (updateFields.length === 0) {
    return res.status(400).json({ error: 'No data to update' });
  }

  values.push(id, vendor_id);
  const sql = `UPDATE vendor_ads SET ${updateFields.join(', ')} WHERE id = ? AND vendor_id = ?`;

  db.query(sql, values, (err) => {
    if (err) return res.status(500).json({ error: err.message });

    res.json({ message: 'Ad updated successfully' });
  });
});

// Delete Ad
router.delete('/vendor/ad-delete/:id', authenticate, (req, res) => {
  const vendor_id = req.user.id;
  const { id } = req.params;

  const sql = 'DELETE FROM vendor_ads WHERE id = ? AND vendor_id = ?';
  db.query(sql, [id, vendor_id], (err) => {
    if (err) return res.status(500).json({ error: err.message });

    res.json({ message: 'Ad deleted successfully' });
  });
});

module.exports = router;
