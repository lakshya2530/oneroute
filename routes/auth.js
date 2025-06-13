// routes/auth.js
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { User } = require("../models");
const router = express.Router();
const authenticateToken = require("../middleware/auth");
const multer = require('multer');
const { Sequelize } = require('../models');  // adjust path if needed
const crypto = require('crypto');


// Configure multer storage for profile image upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/profile_pics/');  // Directory where files will be stored
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));  // Use timestamp for unique filenames
  }
});

const upload = multer({ storage: storage });
// // Register a new user
// router.post("/register", async (req, res) => {
//     const { username, email, password, user_role, user_type } = req.body;
//     console.log(username, email, password);
//   console.log("console 1");

//   try {
//     const existingUser = await User.findOne({ where: { email } });
//     console.log("console 2");
//     if (existingUser)
//       return res.status(400).json({ message: "Email already in use" });

//     const hashedPassword = await bcrypt.hash(password, 10);
//     const user = await User.create({
//       username,
//       email,
//       password: hashedPassword,
//       user_role,  // admin or user
//       user_type   // producer, actor, etc.
//     });
//     console.log("console 3");

//     const token = jwt.sign(
//       { user_id: user.user_id, email: user.email },
//       process.env.JWT_SECRET,
//       { expiresIn: "1h" }
//     );

//     res.status(201).json({ token });
//     console.log("console 4");
//   } catch (err) {
//     res.status(500).json({ message: err.message });
//     console.log("console 0");
//   }
// });

// // Login user
// router.post("/login", async (req, res) => {
//   const { email, password } = req.body;
// console.log("login 1")
//   // Find the user by email
//   const user = await User.findOne({ where: { email } });
// console.log("login 2");


//   if (!user) return res.status(400).json({ error: "User not found" });

//   // Assuming you're using bcrypt to compare the password (adjust logic accordingly)
//   const passwordMatch = true; // This should be bcrypt.compare logic

//   if (!passwordMatch)
//     return res.status(400).json({ error: "Incorrect password" });

//   // Create JWT token with user_id in the payload
//   const token = jwt.sign(
//     { user_id: user.id, email: user.email }, // Include user_id here
//     process.env.JWT_SECRET, // Secret key for encoding
//     { expiresIn: "1h" } // Set expiration time
//   );

//   res.json({ token });
// });

router.post("/register", async (req, res) => {
  const { username, email, password, user_role, user_type } = req.body;

  try {
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser)
      return res.status(400).json({ message: "Email already in use" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      username,
      email,
      password: hashedPassword,
      user_role,
      user_type
    });

    const token = jwt.sign(
      { user_id: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    // Exclude password from response
    const userData = { ...user.toJSON() };
    delete userData.password;

    res.status(201).json({ token, user: userData });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ where: { email } });
    if (!user) return res.status(400).json({ error: "User not found" });

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch)
      return res.status(400).json({ error: "Incorrect password" });

    const token = jwt.sign(
      { user_id: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    // Exclude password from response
    const userData = { ...user.toJSON() };

    delete userData.password;

    res.json({ token, user: userData });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/profile', async (req, res) => {
  try {
    const user = await User.findByPk(req.query.user_id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, data: user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
});


router.put('/update-social-links', authenticateToken, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.user_id); // ID from JWT

    if (!user) return res.status(404).json({ message: 'User not found' });

    const { website, twitter, instagram, linkedin, youtube } = req.body;

    await user.update({ website, twitter, instagram, linkedin, youtube });

    res.json({ message: 'Social links updated', user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router.put('/update-profile', authenticateToken, upload.single('profileImage'), async (req, res) => {
  try {
    const userId = req.user.user_id;
    const {
      bio, age_range, weight, height,
      eye_color, hair_color, union_status,
      languages, representation, special_skills,acting_skills,
      technical_skills,
      physical_attributes 
    } = req.body;

    // Default to null for profile image
    let profileImageUrl = null;

    // If a file is uploaded, store the file path
    if (req.file) {
      profileImageUrl = `uploads/profile_pics/${req.file.filename}`;  // Path to the uploaded image
    }

    // Find the user by user_id
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Update the user profile data
    user.bio = bio ?? user.bio;
    user.age_range = age_range ?? user.age_range;
    user.weight = weight ?? user.weight;
    user.height = height ?? user.height;
    user.eye_color = eye_color ?? user.eye_color;
    user.hair_color = hair_color ?? user.hair_color;
    user.union_status = union_status ?? user.union_status;
    user.languages = languages ?? user.languages;
    user.representation = representation ?? user.representation;
    // user.acting_skills = acting_skills ? JSON.stringify(acting_skills) : user.acting_skills;
    // user.technical_skills = technical_skills ? JSON.stringify(technical_skills) : user.technical_skills;
    // user.special_skills = special_skills ? JSON.stringify(special_skills) : user.special_skills;
    // user.physical_attributes = physical_attributes ? JSON.stringify(physical_attributes) : user.physical_attributes;


    user.physical_attributes = physical_attributes ?? user.physical_attributes;
user.acting_skills = acting_skills ?? user.acting_skills;
user.technical_skills = technical_skills ?? user.technical_skills;
user.special_skills = special_skills ?? user.special_skills;

 //   user.special_skills = special_skills ?? user.special_skills;

    // If a profile image was uploaded, update the user's profile image URL
    if (profileImageUrl) {
      user.profile_image = profileImageUrl;
    }

    // Save the updated user information to the database
    await user.save();

    // Return success response with updated user data
    res.json({ success: true, message: 'Profile updated successfully', data: user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

router.post("/admin/register", async (req, res) => {
  const { username, email, password, user_role, user_type, status, profile_pic_url, verified } = req.body;

  try {
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) return res.status(400).json({ message: "Email already in use" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      username,
      email,
      password: hashedPassword,
      user_role,
      user_type,
      status,
      profile_pic_url,
      verified
    });

    const userData = { ...user.toJSON() };
    delete userData.password;

    res.status(201).json({ message: "User created", user: userData });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


router.get("/admin/users", async (req, res) => {
  const { search, role, status } = req.query;

  const where = {};
  if (search) {
    where[Sequelize.Op.or] = [
      { username: { [Sequelize.Op.iLike]: `%${search}%` } },
      { email: { [Sequelize.Op.iLike]: `%${search}%` } }
    ];
  }
  if (role) where.user_role = role;
  if (status) where.status = status;

  try {
    const users = await User.findAll({ where, attributes: { exclude: ['password'] } });
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete("/admin/users", async (req, res) => {
  try {
    const idsParam = req.query.ids;

    if (!idsParam) {
      return res.status(400).json({ message: "No user IDs provided" });
    }

    const userIds = idsParam.split(",").map(id => parseInt(id.trim())).filter(Boolean);

    const deletedCount = await User.destroy({
      where: { id: userIds },
    });

    res.json({ message: `Deleted ${deletedCount} user(s)` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});



router.put("/admin/users/:id", async (req, res) => {
  const { username, email, user_role, user_type, status, profile_pic_url, verified } = req.body;

  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    await user.update({
      username,
      email,
      user_role,
      user_type,
      status,
      profile_pic_url,
      verified
    });

    const userData = { ...user.toJSON() };
    delete userData.password;

    res.json({ message: "User updated", user: userData });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


router.delete("/admin/users/:id", async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    await user.destroy();

    res.json({ message: "User deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /admin/users/:id/verify
router.patch("/admin/users/:id/verify", async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.verified = true; // or user.isVerified = true depending on your schema
    await user.save();

    res.json({ message: "User verified successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.patch("/admin/users/:id/status", async (req, res) => {
  try {
    const { status } = req.body; // e.g., "active", "inactive", etc.

    const user = await User.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.status = status;
    await user.save();

    res.json({ message: `User status updated to ${status}` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});



router.post('/admin/team/create', async (req, res) => {
  const { name, email, role, generateRandomPassword } = req.body;

  try {
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already exists' });
    }

    let password;
    if (generateRandomPassword) {
      password = crypto.randomBytes(8).toString('hex'); // generate 16-character random password
    } else if (req.body.password) {
      password = req.body.password;
    } else {
      return res.status(400).json({ message: 'Password is required' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await User.create({
      name,
      email,
      password: hashedPassword,
      role,
      status: 'Active',         // you can adjust this field
      verified: false           // default value if you use verification later
    });

    res.status(201).json({
      message: 'Team member created successfully',
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        status: newUser.status
      },
      plainPassword: generateRandomPassword ? password : undefined
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

router.put('/admin/team/:id', async (req, res) => {
  const { name, email, role, status, password } = req.body;
  const userId = req.params.id;

  try {
    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Check if the new email is used by another user
    if (email && email !== user.email) {
      const existingUser = await User.findOne({ where: { email } });
      if (existingUser && existingUser.id !== userId) {
        return res.status(400).json({ message: 'Email is already in use by another user' });
      }
      user.email = email;
    }

    // Optional password update
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      user.password = hashedPassword;
    }

    // Update other fields
    user.name = name ?? user.name;
    user.role = role ?? user.role;
    user.status = status ?? user.status;

    await user.save();

    res.json({
      message: 'Team member updated successfully',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});



// DELETE /admin/team/:id
router.delete('/admin/team/:id', async (req, res) => {
  const userId = req.params.id;

  try {
    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    await user.destroy();

    res.json({ message: 'Team member deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});


module.exports = router;
