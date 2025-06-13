const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../models"); // ✅ Import db
const { User } = require('../models');

router.post("/register", async (req, res) => {
  try {
    const { email, password } = req.body;
    const existingUser = await User.findOne({ where: { email } }); // ✅ This line works now

    if (existingUser)
      return res.status(409).json({ error: "User already exists" });

    const hashed = await bcrypt.hash(password, 10);
    const newUser = await User.create({ email, password: hashed });

    const token = jwt.sign({ id: newUser.id }, "your_secret_key", {
      expiresIn: "7d",
    });

    res
      .status(201)
      .json({ user: { id: newUser.id, email: newUser.email }, token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/', async (req, res) => {
  
  try {
    const users = await User.findAll();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/test-db', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW()');
        res.send(`Database connected successfully at ${result.rows[0].now}`);
    } catch (err) {
        console.error('DB Connection Error:', err);
        res.status(500).send('Database connection failed: ' + err.message);
    }
});


module.exports = router;
