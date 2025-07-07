const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db/connection'); // adjust path
const router = express.Router();

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

  db.query('SELECT * FROM users WHERE email = ? AND user_type = "vendor"', [email], async (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (results.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

    const user = results[0];

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    res.json({ message: 'Login successful', user: { id: user.id, email: user.email } });
  });
});

module.exports = router;
