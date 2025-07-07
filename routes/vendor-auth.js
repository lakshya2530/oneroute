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
  
      // Optional: exclude password from response
      delete user.password;
  
      res.json({
        message: 'Login successful',
        user,
        token,
      });
    });
  });

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
  
    db.query('SELECT * FROM users WHERE id = ?', [id], (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      if (results.length === 0) return res.status(404).json({ message: 'User not found' });
  
      const user = results[0];
  
    //   user.image = user.image
    //     ? `${BASE_URL}/uploads/profiles/${user.image}`
    //     : null;
  
      res.json(user);
    });
  });

  router.post('/vendor-bank-add', verifyToken, (req, res) => {
  const vendor_id = req.user.id; // or req.user.vendor_id
  const { account_holder_name, account_number, ifsc_code, branch_name } = req.body;

  const sql = `INSERT INTO vendor_bank_accounts SET ?`;
  const data = {
    vendor_id,
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
    const vendor_id = req.user.id;
    const { id } = req.params;
    const updatedData = req.body;
  
    const sql = `UPDATE vendor_bank_accounts SET ? WHERE id = ? AND vendor_id = ?`;
  
    db.query(sql, [updatedData, id, vendor_id], (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Bank account updated' });
    });
  });

  
  router.get('/vendor-bank-list', verifyToken, (req, res) => {
    const vendor_id = req.user.id;
  
    db.query('SELECT * FROM vendor_bank_accounts WHERE vendor_id = ?', [vendor_id], (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(results);
    });
  });

  router.delete('/vendor-bank-delete/:id', verifyToken, (req, res) => {
    const vendor_id = req.user.id;
    const { id } = req.params;
  
    db.query('DELETE FROM vendor_bank_accounts WHERE id = ? AND vendor_id = ?', [id, vendor_id], (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Bank account deleted' });
    });
  });
  

module.exports = router;
