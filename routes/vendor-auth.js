const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db/connection');
const router = express.Router();
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const verifyToken = require('../middleware/auth');



// Multer configuration directly in the same file
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, 'uploads/profiles'); // Make sure this folder exists
    },
    filename: function (req, file, cb) {
      const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, uniqueName + path.extname(file.originalname));
    }
  });
  const upload = multer({ storage: storage });
// ✅ Signup
router.post('/vendor-signup', async (req, res) => {
  const { email, password, confirm_password } = req.body;

  if (!email || !password || !confirm_password) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  if (password !== confirm_password) {
    return res.status(400).json({ error: 'Passwords do not match' });
  }

  // check if user already exists
  db.query('SELECT * FROM users WHERE email = ? AND user_type = "vendor"', [email], async (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (results.length > 0) return res.status(409).json({ error: 'Email already registered' });

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = {
      email,
      password: hashedPassword,
      user_type: 'vendor',
      status: 'active',
      registration_date: new Date()
    };

    db.query('INSERT INTO users SET ?', user, (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ message: 'Vendor registered successfully', id: result.insertId });
    });
  });
});

// ✅ Login
router.post('/vendor-login', (req, res) => {
    const { email, password } = req.body;
  
    const sql = 'SELECT * FROM users WHERE email = ? AND user_type = "vendor"';
    db.query(sql, [email], async (err, results) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (results.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
  
      const user = results[0];
  
      const match = await bcrypt.compare(password, user.password);
      if (!match) return res.status(401).json({ error: 'Invalid credentials' });
  
      // ✅ Generate JWT token
      const token = jwt.sign({ id: user.id, email: user.email, user_type: user.user_type }, process.env.JWT_SECRET, {
        expiresIn: '7d',
      });

          // ✅ Check if the vendor has a shop
    const shopCheckSql = 'SELECT COUNT(*) AS shop_count FROM vendor_shops WHERE vendor_id = ?';
    db.query(shopCheckSql, [user.id], (shopErr, shopResult) => {
      if (shopErr) return res.status(500).json({ error: 'Shop check failed' });

      const has_shop = shopResult[0].shop_count > 0;

      const shop = hasShop ? shopResult[0] : null;

      // Optional: exclude password from response
      delete user.password;

      res.json({
        message: 'Login successful',
        token,
        user: {
          ...user,
          has_shop,
          shop
        },
      });
    });
  });
});
  
//       res.json({
//         message: 'Login successful',
//         token,
//         user,
//         has_shop
//       });
//     });
//   });

  router.put('/update-profile', verifyToken, upload.single('image'), (req, res) => {
    const { full_name, user_name, age, gender, bio } = req.body;
    const userId = req.user.id; // Extracted from token
  
    const updatedData = {
      full_name,
      user_name,
      age,
      gender,
      bio
    };
  
    if (req.file) {
      updatedData.image = req.file.filename;
    }
  
    db.query('UPDATE users SET ? WHERE id = ?', [updatedData, userId], (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Profile updated successfully' });
    });
  });

  router.get('/get-profile/:id', (req, res) => {
    const { id } = req.params;
  
    const userQuery = 'SELECT * FROM users WHERE id = ?';
  
    db.query(userQuery, [id], (err, userResults) => {
      if (err) return res.status(500).json({ error: 'User fetch error' });
      if (userResults.length === 0) return res.status(404).json({ message: 'User not found' });
  
      const user = userResults[0];
      delete user.password;
  
      const shopQuery = 'SELECT * FROM vendor_shops WHERE vendor_id = ?';
      db.query(shopQuery, [id], (shopErr, shopResults) => {
        if (shopErr) return res.status(500).json({ error: 'Shop fetch error' });
        const has_shop = shopResults.length > 0;
        const shop_data = has_shop ? shopResults[0] : null;
        
        res.json({
          user,
          has_shop,
          shop:shop_data,
        });
      });
    });
  });
  

  // router.get('/get-profile/:id', (req, res) => {
  //   const { id } = req.params;
  
  //   db.query('SELECT * FROM users WHERE id = ?', [id], (err, results) => {
  //     if (err) return res.status(500).json({ error: err.message });
  //     if (results.length === 0) return res.status(404).json({ message: 'User not found' });
  
  //     const user = results[0];
  
  //   //   user.image = user.image
  //   //     ? `${BASE_URL}/uploads/profiles/${user.image}`
  //   //     : null;
  
  //     res.json(user);
  //   });
  // });

  router.post('/vendor-bank-add', verifyToken, (req, res) => {
  const user_id = req.user.id; // or req.user.vendor_id
  const { account_holder_name, account_number, ifsc_code, branch_name } = req.body;

  const sql = `INSERT INTO vendor_bank_accounts SET ?`;
  const data = {
    user_id,
    account_holder_name,
    account_number,
    ifsc_code,
    branch_name
  };

  db.query(sql, data, (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Bank account added', id: result.insertId });
  });
});


router.put('/vendor-bank-edit/:id', verifyToken, (req, res) => {
    const user_id = req.user.id;
    const { id } = req.params;
    const updatedData = req.body;
  
    const sql = `UPDATE vendor_bank_accounts SET ? WHERE id = ? AND user_id = ?`;
  
    db.query(sql, [updatedData, id, user_id], (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Bank account updated' });
    });
  });

  
  router.get('/vendor-bank-list', verifyToken, (req, res) => {
    const user_id = req.user.id;
  
    db.query('SELECT * FROM vendor_bank_accounts WHERE user_id = ?', [user_id], (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(results);
    });
  });

  router.delete('/vendor-bank-delete/:id', verifyToken, (req, res) => {
    const user_id = req.user.id;
    const { id } = req.params;
  
    db.query('DELETE FROM vendor_bank_accounts WHERE id = ? AND user_id = ?', [id, user_id], (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Bank account deleted' });
    });
  });
  
  router.get('/cms-page/privacy-policy', (req, res) => {
    const { slug, user_type } = req.params;
    const sql = "SELECT * FROM cms_pages WHERE slug = 'privacy-policy' AND user_type = 'vendor'";
  
    db.query(sql, [slug, user_type], (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      if (result.length === 0) return res.status(404).json({ message: 'Page not found' });
      res.json(result[0]);
    });
  });

  router.get('/cms-page/terms-condition', (req, res) => {
    const { slug, user_type } = req.params;
    const sql = "SELECT * FROM cms_pages WHERE slug = 'terms-condition' AND user_type = 'vendor'";
  
    db.query(sql, [slug, user_type], (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      if (result.length === 0) return res.status(404).json({ message: 'Page not found' });
      res.json(result[0]);
    });
  });

  router.get('/vendor-tickets', verifyToken, (req, res) => {
    const vendorId = req.user.id;
  
    const sql = `
      SELECT ticket_id, title, description, status, created_at
      FROM tickets
      WHERE created_by = ?
      ORDER BY created_at DESC
    `;
  
    db.query(sql, [vendorId], (err, results) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json({ tickets: results });
    });
  });
  
  
module.exports = router;
