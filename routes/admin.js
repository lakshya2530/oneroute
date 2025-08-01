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
  const { status } = req.query;

  let sql = `
    SELECT 
      u.*, 
      vs.shop_name,
      vs.vendor_id,
      vs.address,
      vs.gst_number,
      vs.pan_number,
      vs.owner_name,
      vs.shop_document,
      vs.additional_document,
      vs.pincode,
      vs.state,
      vs.city
    FROM users u
    LEFT JOIN vendor_shops vs ON vs.vendor_id = u.id
    WHERE u.user_type = "vendor"
  `;
  
  const params = [];

  if (status && ['VERIFIED', 'ACTIVE', 'PENDING', 'INACTIVE'].includes(status.toUpperCase())) {
    sql += ' AND u.status = ?';
    params.push(status.toUpperCase());
  }

  sql += ' ORDER BY u.id DESC';

  db.query(sql, params, (err, rows) => {
    if (err) return res.status(500).send(err);
    res.json({ shop_data: rows });
  });
});


// router.get('/vendor-list', (req, res) => {
//   const { status } = req.query;

//   let sql = 'SELECT * FROM users WHERE user_type = "vendor" ORDER BY id DESC';
//   const params = [];

//   if (status && ['VERIFIED', 'ACTIVE', 'PENDING', 'INACTIVE'].includes(status.toUpperCase())) {
//     sql += ' AND status = ?';
//     params.push(status.toUpperCase());
//   }

//   db.query(sql, params, (err, rows) => {
//     if (err) return res.status(500).send(err);
//     res.json(rows);
//   });
// });

// router.get('/vendor-list', (req, res) => {
//     db.query('SELECT * FROM users', (err, rows) => {
//         if (err) return res.status(500).send(err);
//         res.json(rows);
//     });
// });

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

// router.get('/customer-list', (req, res) => {
//   db.query(`SELECT * FROM users WHERE user_type = 'customer'`, (err, results) => {
//       if (err) return res.status(500).send(err);
//       res.json(results);
//   });
// });

router.get('/customer-list', (req, res) => {
  const { status } = req.query;
  let sql = "SELECT * FROM users WHERE user_type = 'customer'";
  const params = [];

  if (status && ['VERIFIED', 'ACTIVE', 'PENDING', 'INACTIVE'].includes(status.toUpperCase())) {
    sql += ' AND status = ?';
    params.push(status.toUpperCase());
  }

  sql += ' ORDER BY id DESC';

  db.query(sql, params, (err, results) => {
    if (err) return res.status(500).send(err);
    res.json({ results });
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
    { name: 'license_photo', maxCount: 1 },
    { name: 'rc_front', maxCount: 1 },
    { name: 'rc_back', maxCount: 1 }
  ]),
  (req, res) => {
    const {
      full_name, age, gender, email, phone, vehicle_type,
      type, registration_date, status, user_type, vehicle_brand, vehicle_model
    } = req.body;

    const files = req.files;

    const deliveryUser = {
      full_name, age, gender, email, phone, vehicle_type,
      type, registration_date, status,vehicle_brand, vehicle_model,
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
  const { status } = req.query;
  let sql = "SELECT * FROM users WHERE user_type = 'delivery'";
  const params = [];

  if (status && ['verified', 'active', 'pending', 'inactive'].includes(status.toLowerCase())) {
    sql += ' AND status = ?';
    params.push(status.toUpperCase());
  }

  sql += ' ORDER BY id DESC';

  db.query(sql, params, (err, results) => {
    if (err) return res.status(500).send(err);
    res.json({ results });
  });
});



router.put(
  '/delivery-update/:id',
  upload.fields([
    { name: 'delivery_photo', maxCount: 1 },
    { name: 'vehicle_front', maxCount: 1 },
    { name: 'vehicle_back', maxCount: 1 },
    { name: 'license_photo', maxCount: 1 },
    { name: 'rc_front', maxCount: 1 },
    { name: 'rc_back', maxCount: 1 }
  ]),
  (req, res) => {
    const { id } = req.params;
    const {
      full_name, age, gender, email, phone, vehicle_type,
      type, registration_date, status, user_type, vehicle_brand, vehicle_model
    } = req.body;

    const files = req.files;

    const updatedData = {
      full_name, age, gender, email, phone, vehicle_type,
      type, registration_date, status, user_type, vehicle_brand, vehicle_model,
      // Only update if file was uploaded
      ...(files?.delivery_photo?.[0] && { delivery_photo: files.delivery_photo[0].filename }),
      ...(files?.vehicle_front?.[0] && { vehicle_front: files.vehicle_front[0].filename }),
      ...(files?.vehicle_back?.[0] && { vehicle_back: files.vehicle_back[0].filename }),
      ...(files?.rc_front?.[0] && { rc_front: files.rc_front[0].filename }),
      ...(files?.rc_back?.[0] && { rc_back: files.rc_back[0].filename }),
      ...(files?.license_photo?.[0] && { license_photo: files.license_photo[0].filename }),
    };

    db.query('UPDATE users SET ? WHERE id = ? AND user_type = "delivery"', [updatedData, id], (err, result) => {
      if (err) return res.status(500).send(err);
      res.json({ message: 'Delivery user updated' });
    });
  }
);


// router.put('/delivery-update/:id', (req, res) => {
//   const { id } = req.params;
//   const updatedData = req.body;

//   db.query('UPDATE users SET ? WHERE id = ? AND user_type = "delivery"', [updatedData, id], (err, result) => {
//     if (err) return res.status(500).send(err);
//     res.json({ message: 'Delivery user updated' });
//   });
// });

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




router.post('/service-category-create', (req, res) => {
  const { name } = req.body;
  db.query('INSERT INTO service_categories (name) VALUES (?)', [name], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Service category created', id: result.insertId });
  });
});

router.put('/service-category-update/:id', (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  db.query('UPDATE service_categories SET name = ? WHERE id = ?', [name, id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Service category updated' });
  });
});

router.get('/service-category-list', (req, res) => {
  db.query('SELECT * FROM service_categories ORDER BY id DESC', (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

router.delete('/service-category-delete/:id', (req, res) => {
  const { id } = req.params;

  // Optional: Check for subcategories
  db.query('SELECT COUNT(*) AS count FROM service_subcategories WHERE category_id = ?', [id], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });

    if (result[0].count > 0) {
      return res.status(400).json({ message: 'Cannot delete category with subcategories' });
    }

    db.query('DELETE FROM service_categories WHERE id = ?', [id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Service category deleted' });
    });
  });
});

router.post('/service-subcategory-create', upload.single('image'), (req, res) => {
  const { category_id, name } = req.body;
  const image = req.file?.filename || '';

  db.query(
    'INSERT INTO service_subcategories (category_id, name, image) VALUES (?, ?, ?)',
    [category_id, name, image],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Service subcategory created', id: result.insertId });
    }
  );
});

router.put('/service-subcategory-update/:id', upload.single('image'), (req, res) => {
  const { id } = req.params;
  const { category_id, name } = req.body;
  const image = req.file?.filename;

  const fields = { category_id, name };
  if (image) fields.image = image;

  db.query('UPDATE service_subcategories SET ? WHERE id = ?', [fields, id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Service subcategory updated' });
  });
});

router.get('/service-subcategory-list', (req, res) => {
  const sql = `
    SELECT 
      ss.id,
      ss.name,
      ss.image,
      ss.category_id,
      sc.name AS category_name
    FROM service_subcategories ss
    JOIN service_categories sc ON ss.category_id = sc.id
    ORDER BY ss.id DESC
  `;

  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

router.delete('/service-subcategory-delete/:id', (req, res) => {
  const { id } = req.params;
  db.query('DELETE FROM service_subcategories WHERE id = ?', [id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Service subcategory deleted' });
  });
});


module.exports = router;

