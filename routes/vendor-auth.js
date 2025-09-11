const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db/connection');
const router = express.Router();
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const verifyToken = require('../middleware/auth');
const crypto = require("crypto");

const saltRounds = 10;


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

  function generateOTP() {
  return 123456;//Math.floor(100000 + Math.random() * 900000).toString();
}

router.post("/send-email-otp", (req, res) => {
  const { email } = req.body;
  const otp = generateOTP();

  const sql = "INSERT INTO otp_verifications (email, otp_code, type) VALUES (?, ?, 'email')";
  db.query(sql, [email, otp], (err) => {
    if (err) return res.status(500).json({ error: "Database error" });
    console.log(`Email OTP sent to ${email}: ${otp}`);
    res.json({ success: true, message: "Email OTP sent" });
  });
});

// [2] Verify Email OTP
router.post("/verify-email-otp", (req, res) => {
  const { email, otp } = req.body;

  const sql = "SELECT * FROM otp_verifications WHERE email = ? AND type = 'email' ORDER BY id DESC LIMIT 1";
  db.query(sql, [email], (err, results) => {
    if (err) return res.status(500).json({ error: "Database error" });
    if (!results.length || results[0].otp_code !== otp)
      return res.status(400).json({ success: false, message: "Invalid OTP" });

    db.query("UPDATE otp_verifications SET is_verified = 1 WHERE id = ?", [results[0].id], (updateErr) => {
      if (updateErr) return res.status(500).json({ error: "Update error" });
      res.json({ success: true, message: "Email verified" });
    });
  });
});

// [3] Send Phone OTP
router.post("/send-phone-otp", (req, res) => {
  const { phone } = req.body;
  const otp = generateOTP();

  const sql = "INSERT INTO otp_verifications (phone, otp_code, type) VALUES (?, ?, 'phone')";
  db.query(sql, [phone, otp], (err) => {
    if (err) return res.status(500).json({ error: "Database error" });
    console.log(`Phone OTP sent to ${phone}: ${otp}`);
    res.json({ success: true, message: "Phone OTP sent" });
  });
});

// [4] Verify Phone OTP
router.post("/verify-phone-otp", (req, res) => {
  const { phone, otp } = req.body;

  const sql = "SELECT * FROM otp_verifications WHERE phone = ? AND type = 'phone' ORDER BY id DESC LIMIT 1";
  db.query(sql, [phone], (err, results) => {
    if (err) return res.status(500).json({ error: "Database error" });
    if (!results.length || results[0].otp_code !== otp)
      return res.status(400).json({ success: false, message: "Invalid OTP" });

    db.query("UPDATE otp_verifications SET is_verified = 1 WHERE id = ?", [results[0].id], (updateErr) => {
      if (updateErr) return res.status(500).json({ error: "Update error" });
      res.json({ success: true, message: "Phone verified" });
    });
  });
});

// [5] Register User
// router.post("/register-user", (req, res) => {
//   const { email, phone, password, confirm_password } = req.body;

//   if (password !== confirm_password) return res.status(400).json({ message: "Passwords do not match" });

//   const emailSQL = "SELECT * FROM otp_verifications WHERE email = ? AND type = 'email' AND is_verified = 1";
//   const phoneSQL = "SELECT * FROM otp_verifications WHERE phone = ? AND type = 'phone' AND is_verified = 1";

//   const userExistsSQL = "SELECT * FROM users WHERE email = ? OR phone = ?";
//   db.query(userExistsSQL, [email, phone], (existsErr, users) => {
//     if (existsErr) {
//       console.error("User check error:", existsErr);
//       return res.status(500).json({ error: "User check failed", details: existsErr.message });
//     }

//     if (users.length > 0) {
//       return res.status(400).json({ error: "User with this email or phone already exists" });
//     }
//   });
//   db.query(emailSQL, [email], (err1, emailRows) => {
//     if (err1) return res.status(500).json({ error: "Email check failed" });

//     db.query(phoneSQL, [phone], (err2, phoneRows) => {
//       if (err2) return res.status(500).json({ error: "Phone check failed" });

//       if (!emailRows.length || !phoneRows.length) {
//         return res.status(400).json({ message: "Email and Phone must be verified" });
//       }

//       bcrypt.hash(password, 10, (hashErr, hashedPassword) => {
//         if (hashErr) return res.status(500).json({ error: "Hashing error" });

//         const insertSQL = `
//           INSERT INTO users (email, phone, password, is_email_verified, is_phone_verified, registration_step, user_type)
//           VALUES (?, ?, ?, 1, 1, 1, 'vendor')
//         `;
//         db.query(insertSQL, [email, phone, hashedPassword], (insertErr, result) => {
//           if (insertErr) return res.status(500).json({ error: "Insert error" });

//           res.json({ success: true, message: "User registered successfully", user_id: result.insertId });
//         });
//       });
//     });
//   });
// });

// router.post("/register-user", (req, res) => {
//   const { email, phone, password, confirm_password, referral_code } = req.body;

//   if (password !== confirm_password) {
//     return res.status(400).json({ message: "Passwords do not match" });
//   }

//   const emailSQL = "SELECT * FROM otp_verifications WHERE email = ? AND type = 'email' AND is_verified = 1";
//   const phoneSQL = "SELECT * FROM otp_verifications WHERE phone = ? AND type = 'phone' AND is_verified = 1";

//   const userExistsSQL = "SELECT * FROM users WHERE email = ? OR phone = ?";

//   // Step 1: Check if user already exists
//   db.query(userExistsSQL, [email, phone], (existsErr, users) => {
//     if (existsErr) {
//       console.error("User check error:", existsErr);
//       return res.status(500).json({ error: "User check failed", details: existsErr.message });
//     }

//     if (users.length > 0) {
//       return res.status(400).json({ error: "User with this email or phone already exists" });
//     }

//     // Step 2: Verify email OTP
//     db.query(emailSQL, [email], (err1, emailRows) => {
//       if (err1) return res.status(500).json({ error: "Email check failed" });

//       // Step 3: Verify phone OTP
//       db.query(phoneSQL, [phone], (err2, phoneRows) => {
//         if (err2) return res.status(500).json({ error: "Phone check failed" });

//         if (!emailRows.length || !phoneRows.length) {
//           return res.status(400).json({ message: "Email and Phone must be verified" });
//         }

//         // Step 4: Hash password
//         bcrypt.hash(password, 10, (hashErr, hashedPassword) => {
//           if (hashErr) return res.status(500).json({ error: "Hashing error" });

//           // Step 5: Insert user
//           const insertSQL = `
//             INSERT INTO users 
//               (email, phone, password, is_email_verified, is_phone_verified, registration_step, user_type)
//             VALUES (?, ?, ?, 1, 1, 1, 'vendor')
//           `;

//           db.query(insertSQL, [email, phone, hashedPassword], (insertErr, result) => {
//             if (insertErr) return res.status(500).json({ error: "Insert error" });

//             const newUserId = result.insertId;
//             const myReferralCode = `VEN${newUserId}${Math.floor(1000 + Math.random() * 9000)}`;

//             // Step 6: Save referral_code for this user
//             db.query(`UPDATE users SET referral_code = ? WHERE id = ?`, [myReferralCode, newUserId]);

//             // Step 7: If referred by another vendor
//             if (referral_code) {
//               db.query(
//                 `SELECT id FROM users WHERE referral_code = ? AND user_type = 'vendor'`,
//                 [referral_code],
//                 (err3, refVendor) => {
//                   if (!err3 && refVendor.length > 0) {
//                     const referredBy = refVendor[0].id;

//                     db.query(`UPDATE users SET referred_by = ? WHERE id = ?`, [referredBy, newUserId]);

//                     // Count referrals → give free bid for every 10
//                     db.query(`SELECT COUNT(*) AS total FROM users WHERE referred_by = ?`, [referredBy], (err4, countRes) => {
//                       if (!err4 && countRes[0].total % 10 === 0) {
//                         db.query(
//                           `INSERT INTO vendor_rewards (vendor_id, free_bids) 
//                            VALUES (?, 1) 
//                            ON DUPLICATE KEY UPDATE free_bids = free_bids + 1`,
//                           [referredBy]
//                         );
//                       }
//                     });
//                   }
//                 }
//               );
//             }

//             res.json({
//               success: true,
//               message: "User registered successfully",
//               user_id: newUserId,
//               referral_code: myReferralCode,
//               //referral_link: `https://yourapp.com/signup?vendor_ref=${myReferralCode}`
//             });
//           });
//         });
//       });
//     });
//   });
// });


function generateReferralCode() {
  return "VEND" + crypto.randomBytes(4).toString("hex").toUpperCase();
}

router.post("/register-user", (req, res) => {
  const { email, phone, password, confirm_password, referral_code } = req.body;

  if (password !== confirm_password) {
    return res.status(400).json({ message: "Passwords do not match" });
  }

  const emailSQL = "SELECT * FROM otp_verifications WHERE email = ? AND type = 'email' AND is_verified = 1";
  const phoneSQL = "SELECT * FROM otp_verifications WHERE phone = ? AND type = 'phone' AND is_verified = 1";

  const userExistsSQL = "SELECT * FROM users WHERE email = ? OR phone = ?";
  db.query(userExistsSQL, [email, phone], (existsErr, users) => {
    if (existsErr) return res.status(500).json({ error: "User check failed", details: existsErr.message });
    if (users.length > 0) return res.status(400).json({ error: "User with this email or phone already exists" });

    db.query(emailSQL, [email], (err1, emailRows) => {
      if (err1) return res.status(500).json({ error: "Email check failed" });

      db.query(phoneSQL, [phone], (err2, phoneRows) => {
        if (err2) return res.status(500).json({ error: "Phone check failed" });

        if (!emailRows.length || !phoneRows.length) {
          return res.status(400).json({ message: "Email and Phone must be verified" });
        }

        bcrypt.hash(password, 10, (hashErr, hashedPassword) => {
          if (hashErr) return res.status(500).json({ error: "Hashing error" });

          const newReferralCode = generateReferralCode();
          let referred_by = null;

          const handleInsert = () => {
            const insertSQL = `
              INSERT INTO users (email, phone, password, is_email_verified, is_phone_verified, registration_step, user_type, referral_code, referred_by)
              VALUES (?, ?, ?, 1, 1, 1, 'vendor', ?, ?)
            `;
            db.query(insertSQL, [email, phone, hashedPassword, newReferralCode, referred_by], (insertErr, result) => {
              if (insertErr) return res.status(500).json({ error: "Insert error" });

              res.json({
                success: true,
                message: "User registered successfully",
                user_id: result.insertId,
                referral_code: newReferralCode
              });
            });
          };

          if (referral_code) {
            const referrerSQL = `SELECT id FROM users WHERE referral_code = ? AND user_type = 'vendor'`;
            db.query(referrerSQL, [referral_code], (refErr, refRows) => {
              if (refErr) return res.status(500).json({ error: "Referral lookup failed" });

              if (refRows.length > 0) {
                referred_by = refRows[0].id;

                // ✅ always insert/update vendor_rewards for referrer
                const updateReward = `
                  INSERT INTO vendor_rewards (vendor_id, free_bids, referrals_counted)
                  VALUES (?, 0, 1)
                  ON DUPLICATE KEY UPDATE 
                    referrals_counted = referrals_counted + 1,
                    free_bids = free_bids + IF(MOD(referrals_counted + 1, 10) = 0, 1, 0)
                `;
                db.query(updateReward, [referred_by], (rwErr) => {
                  if (rwErr) console.error("Reward update failed:", rwErr);
                  handleInsert();
                });
              } else {
                handleInsert();
              }
            });
          } else {
            handleInsert();
          }
        });
      });
    });
  });
});

// [6] Create Profile
router.post("/create-profile", (req, res) => {
  const { user_id, full_name, age, gender } = req.body;

  const sql = "UPDATE users SET full_name = ?, age = ?, gender = ?, registration_step = 2 WHERE id = ?";
  db.query(sql, [full_name, age, gender, user_id], (err) => {
    if (err) return res.status(500).json({ error: "Profile update error" });
    res.json({ message: "Profile updated", registration_step: 2 });
  });
});

// [7] Create Shop
router.post("/create-shop", (req, res) => {
  const { user_id, shop_name, address, pincode, state, city,owner_name,latitude,longitude } = req.body;

  const insertShop = "INSERT INTO vendor_shops (vendor_id, shop_name, address, is_approved,pincode,state,city,owner_name,latitude,longitude) VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?)";
  const updateUser = "UPDATE users SET registration_step = 3 WHERE id = ?";

  db.query(insertShop, [user_id, shop_name, address,pincode, state, city,owner_name,latitude,longitude], (shopErr) => {
    if (shopErr) return res.status(500).json({ error: "Shop creation failed" });

    db.query(updateUser, [user_id], (updateErr) => {
      if (updateErr) return res.status(500).json({ error: "User update failed" });

      res.json({ message: "Shop created, pending admin approval" });
    });
  });
});

// [8] Vendor Login
router.post("/vendor-login", (req, res) => {
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


router.post('/user-verify', (req, res) => {
  const { user_id } = req.body;

  if (!user_id) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  const sql = 'UPDATE users SET status = "verified" WHERE id = ?';
  db.query(sql, [user_id], (err, result) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Database error' });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'User not found or already verified' });
    }

    res.json({ message: 'User has been marked as verified', user_id });
  });
});


// [8] Vendor Login
// router.post("/vendor-login", async (req, res) => {
//   try {
//     const { identifier, password } = req.body;

//     const [results] = await db.query(
//       `SELECT * FROM users WHERE (email = ? OR phone = ?)`,
//       [identifier, identifier]
//     );

//     if (results.length === 0) {
//       return res.status(401).json({ error: "Invalid credentials" });
//     }

//     // Compare password (use bcrypt if hashed)
//     const user = results[0];
//     if (user.password !== password) {
//       return res.status(401).json({ error: "Invalid credentials" });
//     }

//     res.json({ message: "Login successful", user });
//   } catch (error) {
//     console.error("Error in vendor login:", error);
//     res.status(500).json({ error: "Internal server error" });
//   }
// });



// STEP 1: Start signup (store temp values and OTP)
// router.post('/register-step-1', async (req, res) => {
//   const { phone, email, name, password, confirmPassword } = req.body;

//   if (!phone || !email || !name || !password || !confirmPassword) {
//     return res.status(400).json({ error: 'All fields are required' });
//   }

//   if (password !== confirmPassword) {
//     return res.status(400).json({ error: 'Passwords do not match' });
//   }

//   const phoneOtp = generateOTP();
//   const emailOtp = generateOTP();
//   const hashedPassword = await bcrypt.hash(password, saltRounds);

//   try {
//     const [existing] = await db.query('SELECT id FROM users WHERE phone_temp = ? OR email_temp = ?', [phone, email]);

//     if (existing.length > 0) {
//       await db.query(
//         `UPDATE users 
//          SET full_name = ?, password = ?, phone_otp = ?, email_otp = ?, phone_temp = ?, email_temp = ?, registration_step = 1 
//          WHERE id = ?`,
//         [name, hashedPassword, phoneOtp, emailOtp, phone, email, existing[0].id]
//       );
//       return res.json({ message: 'OTP re-sent', userId: existing[0].id });
//     }

//     const [result] = await db.query(
//       `INSERT INTO users (full_name, password, phone_temp, email_temp, phone_otp, email_otp, registration_step) 
//        VALUES (?, ?, ?, ?, ?, ?, 1)`,
//       [name, hashedPassword, phone, email, phoneOtp, emailOtp]
//     );

//     return res.json({ message: 'OTP sent', userId: result.insertId });
//   } catch (err) {
//     return res.status(500).json({ error: 'Server error', err });
//   }
// });

// // STEP 2: Verify OTPs
// router.post('/verify-otp', async (req, res) => {
//   const { userId, phoneOtp, emailOtp } = req.body;

//   try {
//     const [users] = await db.query(`SELECT * FROM users WHERE id = ?`, [userId]);
//     const user = users[0];

//     if (!user) return res.status(404).json({ error: 'User not found' });

//     if (user.phone_otp === phoneOtp && user.email_otp === emailOtp) {
//       await db.query(
//         `UPDATE users SET phone_verified = 1, email_verified = 1, phone = phone_temp, email = email_temp, registration_step = 2 WHERE id = ?`,
//         [userId]
//       );
//       return res.json({ message: 'OTP verified. Proceed to step 2' });
//     }

//     return res.status(400).json({ error: 'Invalid OTPs' });
//   } catch (err) {
//     return res.status(500).json({ error: 'Server error', err });
//   }
// });

// // STEP 3: Profile Info
// router.post('/register-step-2', async (req, res) => {
//   const { userId, name, gender, age } = req.body;

//   try {
//     await db.query(
//       `UPDATE users SET full_name = ?, gender = ?, age = ?, registration_step = 3 WHERE id = ?`,
//       [name, gender, age, userId]
//     );
//     return res.json({ message: 'Profile saved. Proceed to step 3' });
//   } catch (err) {
//     return res.status(500).json({ error: 'Server error', err });
//   }
// });

// // STEP 4: Shop Info
// router.post('/register-step-3', async (req, res) => {
//   const { userId, shop_name, shop_type } = req.body;

//   try {
//     await db.query(
//       `UPDATE users SET shop_name = ?, shop_type = ?, registration_step = 4 WHERE id = ?`,
//       [shop_name, shop_type, userId]
//     );
//     return res.json({ message: 'Signup completed.' });
//   } catch (err) {
//     return res.status(500).json({ error: 'Server error', err });
//   }
// });

// // LOGIN
// router.post('/vendor-login', async (req, res) => {
//   const { phone } = req.body;

//   try {
//     const [users] = await db.query(`SELECT * FROM users WHERE phone = ?`, [phone]);
//     const user = users[0];

//     if (!user) return res.status(404).json({ error: 'User not found' });

//     if (user.registration_step < 4) {
//       return res.json({ message: 'Incomplete registration', registration_step: user.registration_step, userId: user.id });
//     }

//     return res.json({ message: 'Login successful', user });
//   } catch (err) {
//     return res.status(500).json({ error: 'Server error', err });
//   }
// });
// ✅ Signup
// router.post('/vendor-signup', async (req, res) => {
//   const { email, password, confirm_password } = req.body;

//   if (!email || !password || !confirm_password) {
//     return res.status(400).json({ error: 'All fields are required' });
//   }

//   if (password !== confirm_password) {
//     return res.status(400).json({ error: 'Passwords do not match' });
//   }

//   // check if user already exists
//   db.query('SELECT * FROM users WHERE email = ? AND user_type = "vendor"', [email], async (err, results) => {
//     if (err) return res.status(500).json({ error: err.message });
//     if (results.length > 0) return res.status(409).json({ error: 'Email already registered' });

//     const hashedPassword = await bcrypt.hash(password, 10);

//     const user = {
//       email,
//       password: hashedPassword,
//       user_type: 'vendor',
//       status: 'active',
//       registration_date: new Date()
//     };

//     db.query('INSERT INTO users SET ?', user, (err, result) => {
//       if (err) return res.status(500).json({ error: err.message });
//       res.status(201).json({ message: 'Vendor registered successfully', id: result.insertId });
//     });
//   });
// });

// // ✅ Login

  
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
