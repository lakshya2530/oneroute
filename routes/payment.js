// routes/payment.js
const express = require("express");
const router = express.Router();
const razorpay = require("../config/razorpay");
const crypto = require('crypto');
const authenticateToken = require("../middleware/auth");
const { Transaction } = require('../models');
const { log } = require("console");

// router.post("/create-order",authenticateToken, async (req, res) => {
//   try {
//     const { amount, plan_name } = req.body;

//     if (!amount || !plan_name) {
//       return res.status(400).json({ message: "Amount and plan name are required" });
//     }

//     const options = {
//       amount: amount * 100, // convert to paise
//       currency: "INR",
//       receipt: `receipt_${Date.now()}_${plan_name}`,
//     };

//     const order = await razorpay.orders.create(options);

//     res.json({ order });
//   } catch (error) {
//     console.error("Error creating Razorpay order:", error.message);
//     res.status(500).json({ message: "Failed to create Razorpay order" });
//   }
// });

router.post("/create-order", authenticateToken, async (req, res) => {
  try {
    const { amount, plan_name } = req.body;
    const options = {
      amount: amount * 100,
      currency: "INR",
      receipt: `receipt_${Date.now()}_${plan_name}`
    };
    const order = await razorpay.orders.create(options);
    res.json({ order });
  } catch (err) {
    res.status(500).json({ message: "Failed to create order" });
  }
});
router.post("/verify-payment", authenticateToken, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount, plan_name } = req.body;
    const userId = req.user.user_id;

    const generated_signature = crypto
      .createHmac("sha256", process.env.RAZORPAY_SECRET)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest("hex");

    if (generated_signature !== razorpay_signature) {
      return res.status(400).json({ success: false, message: "Invalid payment signature" });
    }

    // Save transaction
    await Transaction.create({
      user_id: userId,
      plan_name,
      amount,
      razorpay_order_id,
      razorpay_payment_id,
      currency: "INR",
      payment_status: "paid",
      status: "success"
    });

    res.json({ success: true, message: "Payment verified and recorded" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
// router.post('/verify-payment',authenticateToken, async (req, res) => {
//   try {
//     const { razorpay_payment_id, amount, plan_name,razorpay_order_id, payment_status} = req.body;
//     const userId = req.user.user_id;

//     await Transaction.create({
//       user_id: userId,
//       plan_name,
//       amount,
//       razorpay_payment_id: razorpay_payment_id,
//       razorpay_order_id:razorpay_order_id,
//      payment_status:payment_status,
//       currency:'INR',
//       status: 'success',
//     });

//     res.json({ success: true, message: 'Payment recorded successfully' });
//   } catch (error) {
//     res.status(500).json({ success: false, message: error.message });
//   }
// });

router.get("/active-plan", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id;

    const activePlan = await Transaction.findOne({
      where: {
        user_id: userId,
        payment_status: 'paid'
      },
      order: [['createdAt', 'DESC']]
    });

    if (!activePlan) {
      return res.status(404).json({ message: "No active plan found" });
    }

    res.json({
      success: true,
      activePlan
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/transactions", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id;

    const transactions = await Transaction.findAll({
      where: {
        user_id: userId
      },
      order: [['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      transactions
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
