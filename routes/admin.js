const express = require('express');
const router = express.Router();
const { User, Job, Application,Post, Event,Notification } = require('../models');
const { Op, Sequelize } = require('sequelize');
const authenticateAdmin = require('../middleware/auth'); // custom middleware to check admin
const db = require('../db/connection');
const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/'); // ensure uploads folder exists
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage });

// Create
// router.post('/vendor-register', (req, res) => {
//     const {
//         full_name, age, gender, email, phone,
//         type, registration_date, shop_name,
//         shop_certificate, status,user_type
//     } = req.body;

//     const sql = `INSERT INTO vendors SET ?`;
//     const vendor = {
//         full_name, age, gender, email, phone,
//         type, registration_date, shop_name,
//         shop_certificate, status
//     };

//     db.query(sql, vendor, (err, result) => {
//         if (err) return res.status(500).send(err);
//         res.json({ id: result.insertId, ...vendor });
//     });
// });
router.post('/vendor-register', upload.single('shop_certificate'), (req, res) => {
  const {
      full_name, age, gender, email, phone,
      type, registration_date, shop_name,
      status, user_type
  } = req.body;

  const shop_certificate = req.file ? req.file.filename : null;

  const sql = `INSERT INTO users SET ?`;
  const user = {
      full_name, age, gender, email, phone,
      type, registration_date, shop_name,
      shop_certificate, status, user_type
  };

  db.query(sql, user, (err, result) => {
      if (err) {
          console.error('DB Error:', err);
          return res.status(500).json({ error: 'Database error', details: err });
      }

      res.json({ id: result.insertId, ...user });
  });
});

// List
router.get('/vendor-list', (req, res) => {
    db.query('SELECT * FROM users', (err, rows) => {
        if (err) return res.status(500).send(err);
        res.json(rows);
    });
});

// Edit
// router.put('/update-vendor/:id', (req, res) => {
//     const { id } = req.params;
//     const updatedData = req.body;

//     db.query('UPDATE vendors SET ? WHERE id = ?', [updatedData, id], (err, result) => {
//         if (err) return res.status(500).send(err);
//         res.json({ message: 'Vendor updated successfully' });
//     });
// });

router.put('/update-vendor/:id', upload.single('shop_certificate'), (req, res) => {
  const { id } = req.params;
  const updatedData = { ...req.body };

  // If file uploaded, add to update data
  if (req.file) {
      updatedData.shop_certificate = req.file.filename;
  }

  db.query('UPDATE users SET ? WHERE id = ?', [updatedData, id], (err, result) => {
      if (err) {
          console.error('Update error:', err);
          return res.status(500).send(err);
      }

      res.json({ message: 'Vendor updated successfully' });
  });
});

// Delete
router.delete('/vendor/:id', (req, res) => {
    const { id } = req.params;

    db.query('DELETE FROM users WHERE id = ?', [id], (err, result) => {
        if (err) return res.status(500).send(err);
        res.json({ message: 'Vendor deleted successfully' });
    });
});


router.post('/customer-register', (req, res) => {
  const {
      full_name, age, gender, email, phone,
      type, registration_date, status,user_type
  } = req.body;

  const sql = `INSERT INTO users SET ?`;
  const customer = {
      full_name, age, gender, email, phone,
      type, registration_date, status,
      user_type
  };

  db.query(sql, customer, (err, result) => {
      if (err) return res.status(500).send(err);
      res.json({ id: result.insertId, ...customer });
  });
});

router.get('/customer-list', (req, res) => {
  db.query(`SELECT * FROM users WHERE user_type = 'customer'`, (err, results) => {
      if (err) return res.status(500).send(err);
      res.json(results);
  });
});

router.put('/customer-update/:id', (req, res) => {
  const { id } = req.params;
  const updatedData = req.body;

  db.query('UPDATE users SET ? WHERE id = ? AND user_type = "customer"', [updatedData, id], (err, result) => {
      if (err) return res.status(500).send(err);
      res.json({ message: 'Customer updated successfully' });
  });
});


router.delete('/customer-delete/:id', (req, res) => {
  const { id } = req.params;

  db.query('DELETE FROM users WHERE id = ? AND user_type = "customer"', [id], (err, result) => {
      if (err) return res.status(500).send(err);
      res.json({ message: 'Customer deleted successfully' });
  });
});

router.patch('/customer-status/:id', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  db.query('UPDATE users SET status = ? WHERE id = ? AND user_type = "customer"', [status, id], (err, result) => {
      if (err) return res.status(500).send(err);
      res.json({ message: 'Customer status updated successfully' });
  });
});



router.post(
  '/delivery-register',
  upload.fields([
    { name: 'delivery_photo', maxCount: 1 },
    { name: 'vehicle_front', maxCount: 1 },
    { name: 'vehicle_back', maxCount: 1 },
    { name: 'license_photo', maxCount: 1 }
  ]),
  (req, res) => {
    const {
      full_name, age, gender, email, phone, vehicle_type,
      type, registration_date, status,user_type,vehicle_brand,vehicle_model
    } = req.body;

    const files = req.files;

    const deliveryUser = {
      full_name, age, gender, email, phone, vehicle_type,
      type, registration_date, status,
      user_type,
      delivery_photo: files?.delivery_photo?.[0]?.filename || '',
      vehicle_front: files?.vehicle_front?.[0]?.filename || '',
      vehicle_back: files?.vehicle_back?.[0]?.filename || '',
      rc_front: files?.rc_front?.[0]?.filename || '',
      rc_back: files?.rc_back?.[0]?.filename || '',
      license_photo: files?.license_photo?.[0]?.filename || ''
    };

    db.query('INSERT INTO users SET ?', deliveryUser, (err, result) => {
      if (err) return res.status(500).send(err);
      res.json({ message: 'Delivery user created', id: result.insertId });
    });
  }
);

router.get('/delivery-list', (req, res) => {
  db.query("SELECT * FROM users WHERE user_type = 'delivery'", (err, results) => {
    if (err) return res.status(500).send(err);
    res.json(results);
  });
});


router.put('/delivery-update/:id', (req, res) => {
  const { id } = req.params;
  const updatedData = req.body;

  db.query('UPDATE users SET ? WHERE id = ? AND user_type = "delivery"', [updatedData, id], (err, result) => {
    if (err) return res.status(500).send(err);
    res.json({ message: 'Delivery user updated' });
  });
});

router.delete('/delivery-delete/:id', (req, res) => {
  const { id } = req.params;

  db.query('DELETE FROM users WHERE id = ? AND user_type = "delivery"', [id], (err, result) => {
    if (err) return res.status(500).send(err);
    res.json({ message: 'Delivery user deleted' });
  });
});


router.patch('/delivery-status/:id', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  db.query('UPDATE users SET status = ? WHERE id = ? AND user_type = "delivery"', [status, id], (err, result) => {
    if (err) return res.status(500).send(err);
    res.json({ message: 'Delivery user status updated' });
  });
});



module.exports = router;

