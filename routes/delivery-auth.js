const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db/connection');
const router = express.Router();
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const verifyToken = require('../middleware/auth');

const saltRounds = 10;


// Multer configuration directly in the same file
// const storage = multer.diskStorage({
//     destination: function (req, file, cb) {
//       cb(null, 'uploads/profiles'); // Make sure this folder exists
//     },
//     filename: function (req, file, cb) {
//       const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9);
//       cb(null, uniqueName + path.extname(file.originalname));
//     }
//   });
//   const upload = multer({ storage: storage });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/delivery_profiles/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname));
  }
});

const upload = multer({ storage });


// [5] Register User
router.post("/register-delivery-user", (req, res) => {
  const { email, phone, password, confirm_password } = req.body;

  if (password !== confirm_password) return res.status(400).json({ message: "Passwords do not match" });

  const emailSQL = "SELECT * FROM otp_verifications WHERE email = ? AND type = 'email' AND is_verified = 1";
  const phoneSQL = "SELECT * FROM otp_verifications WHERE phone = ? AND type = 'phone' AND is_verified = 1";

  const userExistsSQL = "SELECT * FROM users WHERE email = ? OR phone = ?";
  db.query(userExistsSQL, [email, phone], (existsErr, users) => {
    if (existsErr) {
      console.error("User check error:", existsErr);
      return res.status(500).json({ error: "User check failed", details: existsErr.message });
    }

    if (users.length > 0) {
      return res.status(400).json({ error: "User with this email or phone already exists" });
    }
  });
  db.query(emailSQL, [email], (err1, emailRows) => {
    if (err1) return res.status(500).json({ error: "Email check failed" });

    db.query(phoneSQL, [phone], (err2, phoneRows) => {
      if (err2) return res.status(500).json({ error: "Phone check failed" });

      if (!emailRows.length || !phoneRows.length) {
        return res.status(400).json({ message: "Email and Phone must be verified" });
      }

      bcrypt.hash(password, 10, (hashErr, hashedPassword) => {
        if (hashErr) return res.status(500).json({ error: "Hashing error" });

        const insertSQL = `
          INSERT INTO users (email, phone, password, is_email_verified, is_phone_verified, registration_step, user_type)
          VALUES (?, ?, ?, 1, 1, 1, 'delivery')
        `;
        db.query(insertSQL, [email, phone, hashedPassword], (insertErr, result) => {
          if (insertErr) return res.status(500).json({ error: "Insert error" });

          res.json({ success: true, message: "User registered successfully", user_id: result.insertId });
        });
      });
    });
  });
});



// [6] Create Profile
router.post(
  "/create-profile-delivery",
  upload.fields([
    { name: "driving_license_front", maxCount: 1 },
    { name: "driving_license_back", maxCount: 1 },
    { name: "aadhar_card", maxCount: 1 },
    { name: "pan_card", maxCount: 1 }
  ]),
  (req, res) => {
    const {
      user_id,
      full_name,
      dob,
      gender,
      experience,
      vehicle_number,
      vehicle_brand
    } = req.body;

    const files = req.files;

    const profileData = {
      full_name,
      dob,
      gender,
      experience,
      vehicle_number,
      vehicle_brand,
      driving_license_front: files?.driving_license_front?.[0]?.filename || null,
      driving_license_back: files?.driving_license_back?.[0]?.filename || null,
      aadhar_card: files?.aadhar_card?.[0]?.filename || null,
      pan_card: files?.pan_card?.[0]?.filename || null,
      registration_step: 2
    };

    const sql = `
      UPDATE users 
      SET full_name = ?, dob = ?, gender = ?, experience = ?, vehicle_number = ?, vehicle_brand = ?, 
          driving_license_front = ?, driving_license_back = ?, aadhar_card = ?, pan_card = ?, registration_step = 2
      WHERE id = ?
    `;

    db.query(sql, [
      profileData.full_name,
      profileData.dob,
      profileData.gender,
      profileData.experience,
      profileData.vehicle_number,
      profileData.vehicle_brand,
      profileData.driving_license_front,
      profileData.driving_license_back,
      profileData.aadhar_card,
      profileData.pan_card,
      user_id
    ], (err) => {
      if (err) return res.status(500).json({ error: "Profile update error", details: err.message });

      res.json({
        message: "Delivery profile created successfully",
        registration_step: 2
      });
    });
  }
);


// [8] Vendor Login
router.post("/delivery-login", (req, res) => {
  const { identifier, password } = req.body;

  const sql = "SELECT * FROM users WHERE email = ? OR phone = ?";
  db.query(sql, [identifier, identifier], (err, results) => {
    if (err) return res.status(500).json({ error: "Database error" });
    if (!results.length) return res.status(401).json({ error: "Invalid credentials" });

    const user = results[0];

    bcrypt.compare(password, user.password, (compareErr, isMatch) => {
      if (compareErr || !isMatch) return res.status(401).json({ error: "Invalid credentials" });

      const token = jwt.sign(
        { id: user.id, email: user.email, user_type: user.user_type },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      const shopSQL = "SELECT * FROM vendor_shops WHERE vendor_id = ?";
      db.query(shopSQL, [user.id], (shopErr, shopResults) => {
        if (shopErr) return res.status(500).json({ error: "Shop check failed" });

        const has_shop = shopResults.length > 0;
        const shop = has_shop ? shopResults[0] : null;

        delete user.password; // remove password from response

        res.json({
          message: "Login successful",
          token,
          user: {
            ...user,
            has_shop,
            shop
          }
        });
      });
    });
  });
});

router.post('/check-gst-pan', (req, res) => {
  const { vendor_id } = req.body;

  if (!vendor_id) {
    return res.status(400).json({ error: 'vendor_id is required' });
  }

  const sql = 'SELECT gst_number, pan_number FROM vendor_shops WHERE vendor_id = ?';
  db.query(sql, [vendor_id], (err, results) => {
    if (err) {
      return res.status(500).json({ error: 'Database error', details: err.message });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: 'Vendor shop not found' });
    }

    const { gst_number, pan_number } = results[0];

    res.json({
      gst_exists: !!gst_number,
      pan_exists: !!pan_number,
      gst_number,
      pan_number
    });
  });
});




  router.put('/update-profile', verifyToken, upload.single('image'), (req, res) => {
    const { full_name, user_name, age, gender, bio } = req.body;
    const userId = req.user.id; // Extracted from token
    const image = req.file?.filename;
    

    const updatedData = {
      full_name,
      user_name,
      age,
      gender,
      bio
    };
  
    if (image) {
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
  


  
  router.get('/cms-page/privacy-policy', (req, res) => {
    const { slug, user_type } = req.params;
    const sql = "SELECT * FROM cms_pages WHERE slug = 'privacy-policy' AND user_type = 'delivery'";
  
    db.query(sql, [slug, user_type], (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      if (result.length === 0) return res.status(404).json({ message: 'Page not found' });
      res.json(result[0]);
    });
  });

  router.get('/cms-page/terms-condition', (req, res) => {
    const { slug, user_type } = req.params;
    const sql = "SELECT * FROM cms_pages WHERE slug = 'terms-condition' AND user_type = 'delivery'";
  
    db.query(sql, [slug, user_type], (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      if (result.length === 0) return res.status(404).json({ message: 'Page not found' });
      res.json(result[0]);
    });
  });

  router.get('/delivery-tickets', verifyToken, (req, res) => {
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
