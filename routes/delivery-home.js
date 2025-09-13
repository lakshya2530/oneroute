const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const authenticate = require('../middleware/auth');




router.get('/delivery-partner/pending-requests', authenticate, (req, res) => {
  const partner_id = req.user.id;

  const sql = `
    SELECT 
      dr.id AS request_id, 
      dr.order_id, 
      dr.customer_id, 
      dr.status,

      -- Order
      o.order_number, 
      o.amount, 
      o.customer_address, 
      o.customer_city, 
      o.customer_pincode,

      -- Customer (from users)
      cu.full_name AS customer_name,
      cu.phone AS customer_phone,

      -- Shop / Vendor
      s.id AS shop_id,
      s.shop_name,
      s.address AS shop_address,
      s.city AS shop_city,
      s.state AS shop_state,
      s.latitude AS shop_latitude,
      s.longitude AS shop_longitude,

      -- Vendor (from users table)
      vu.full_name AS vendor_name,
      vu.phone AS vendor_phone
    FROM delivery_request_partners drp
    JOIN delivery_requests dr 
      ON drp.request_id = dr.id
    JOIN orders o 
      ON dr.order_id = o.id
    JOIN users cu 
      ON dr.customer_id = cu.id         -- Customer details
    JOIN shops s 
      ON o.vendor_id = s.vendor_id      -- Shop details
    JOIN users vu 
      ON o.vendor_id = vu.id            -- Vendor details
    WHERE drp.partner_id = ? 
      AND drp.status = 'pending' 
      AND dr.status = 'pending'
  `;

  db.query(sql, [partner_id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});




router.get('/order/:order_id', authenticate, (req, res) => {
  const order_id = req.params.order_id;
  const baseUrl = `${req.protocol}://${req.get('host')}/uploads`;

  // Step 1: Get order details
  const orderSql = `
    SELECT 
      o.*,
      u.full_name AS customer_name,
      u.phone AS customer_phone,
      u.email AS customer_email
    FROM orders o
    JOIN users u ON o.customer_id = u.id
    WHERE o.id = ?
  `;

  db.query(orderSql, [order_id], (err, orders) => {
    if (err) return res.status(500).json({ error: err.message });
    if (orders.length === 0) return res.status(404).json({ error: 'Order not found' });

    const order = orders[0];

    // Step 2: Get order items with product + vendor/shop info
    const itemsSql = `
      SELECT 
        oi.id AS order_item_id,
        oi.quantity,
        oi.price,
        p.id AS product_id,
        p.name AS product_name,
        p.images,
        p.specifications,
        vs.shop_name,
        vs.description AS shop_description,
        vs.shop_image
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      JOIN vendor_shops vs ON oi.vendor_id = vs.vendor_id
      WHERE oi.order_id = ?
    `;

    db.query(itemsSql, [order_id], (err, items) => {
      if (err) return res.status(500).json({ error: err.message });

      const formattedItems = items.map(item => ({
        order_item_id: item.order_item_id,
        product_id: item.product_id,
        product_name: item.product_name,
        quantity: item.quantity,
        price: item.price,
        total: item.price * item.quantity,
        images: (() => {
          try {
            return JSON.parse(item.images || '[]').map(
              img => `${baseUrl}/products/${img}`
            );
          } catch (e) {
            return [];
          }
        })(),
        specifications: (() => {
          try {
            return JSON.parse(item.specifications || '[]');
          } catch (e) {
            return [];
          }
        })(),
        shop: {
          name: item.shop_name,
          description: item.shop_description,
          shop_image: item.shop_image ? `${baseUrl}/shops/${item.shop_image}` : ''
        }
      }));

      const totalAmount = formattedItems.reduce((sum, i) => sum + i.total, 0);

      res.json({
        order: {
          ...order,
          total_amount: totalAmount,
          items: formattedItems
        }
      });
    });
  });

  
});


router.post('/order/:order_id/feedback', authenticate, (req, res) => {
  const order_id = req.params.order_id;
  const delivery_partner_id = req.user.id; // must be delivery partner
  const { rating, description } = req.body;

  if (!rating) return res.status(400).json({ error: 'Rating is required' });

  const feedbackData = {
    order_id,
    delivery_partner_id,
    rating,
    description
  };

  // Insert or update feedback
  const sql = `
    INSERT INTO order_feedback (order_id, delivery_partner_id, rating, description)
    VALUES (?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE rating = VALUES(rating), description = VALUES(description)
  `;

  db.query(sql, [order_id, delivery_partner_id, rating, description], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Feedback submitted successfully' });
  });
});

router.get('/wallet', authenticate, (req, res) => {
  const user_id = req.user.id;

  const walletSql = `SELECT id, balance FROM wallets WHERE user_id = ?`;
  db.query(walletSql, [user_id], (err, wallets) => {
    if (err) return res.status(500).json({ error: err.message });

    if (wallets.length === 0) {
      return res.json({ balance: 0, transactions: [] });
    }

    const wallet = wallets[0];

    const txnSql = `
      SELECT id, amount, type, description, created_at 
      FROM wallet_transactions 
      WHERE wallet_id = ? 
      ORDER BY created_at DESC
    `;

    db.query(txnSql, [wallet.id], (err, transactions) => {
      if (err) return res.status(500).json({ error: err.message });

      res.json({
        balance: wallet.balance,
        transactions
      });
    });
  });
});

router.get('/delivery-partner/pending-requests', authenticate, (req, res) => {
  const partner_id = req.user.id;

  const sql = `
    SELECT 
      dr.id AS request_id, 
      dr.order_id, 
      dr.customer_id, 
      dr.status,

      -- Order
      o.order_number, 
      o.amount, 
      o.customer_address, 
      o.customer_city, 
      o.customer_pincode,

      -- Customer
      u.full_name AS customer_name,
      u.phone AS customer_phone,

      ca.name AS address_name,
      ca.description AS address_description,
      ca.latitude AS customer_latitude,
      ca.longitude AS customer_longitude,

      -- Shop / Vendor
      s.id AS shop_id,
      s.shop_name,
      s.address AS shop_address,
      s.latitude AS shop_latitude,
      s.longitude AS shop_longitude,
      s.city AS shop_city,
      s.state AS shop_state
    FROM delivery_request_partners drp
    JOIN delivery_requests dr 
      ON drp.request_id = dr.id
    JOIN orders o 
      ON dr.order_id = o.id
    JOIN users u 
      ON dr.customer_id = u.id
    LEFT JOIN customer_addresses ca 
      ON o.address_id = ca.id
    LEFT JOIN shops s 
      ON o.vendor_id = s.vendor_id
    WHERE drp.partner_id = ? 
      AND drp.status = 'pending' 
      AND dr.status = 'pending'
  `;

  db.query(sql, [partner_id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    res.json(rows);
  });
});


// router.get('/delivery-partner/pending-requests', authenticate, (req, res) => {
//   const partner_id = req.user.id;

//   const sql = `
//     SELECT dr.id AS request_id, dr.order_id, dr.customer_id, dr.status,
//            o.order_number, o.amount, o.customer_address, o.customer_city, o.customer_pincode
//     FROM delivery_request_partners drp
//     JOIN delivery_requests dr ON drp.request_id = dr.id
//     JOIN orders o ON dr.order_id = o.id
//     WHERE drp.partner_id = ? AND drp.status = 'pending' AND dr.status = 'pending'
//   `;

//   db.query(sql, [partner_id], (err, rows) => {
//     if (err) return res.status(500).json({ error: err.message });
//     res.json(rows);
//   });
// });

router.post('/delivery-partner/respond-request', authenticate, (req, res) => {
  const partner_id = req.user.id;
  const { request_id, action } = req.body; // action = "accept" or "reject"

  if (!['accept', 'reject'].includes(action)) {
    return res.status(400).json({ error: "Invalid action" });
  }

  // If accept → check if already assigned
  if (action === 'accept') {
    const sqlCheck = `SELECT * FROM delivery_requests WHERE id = ? AND status = 'pending'`;
    db.query(sqlCheck, [request_id], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      if (rows.length === 0) return res.status(400).json({ error: "Request already assigned or expired" });

      const order_id = rows[0].order_id;

      // Generate 4-digit OTP
      const otp = 1234; //Math.floor(1000 + Math.random() * 9000).toString();

      // Assign this partner + update delivery date
      const sqlUpdateReq = `
        UPDATE delivery_requests 
        SET assigned_partner_id = ?, status = 'accepted' 
        WHERE id = ?
      `;
      db.query(sqlUpdateReq, [partner_id, request_id], (err2) => {
        if (err2) return res.status(500).json({ error: err2.message });

        // Reject all others
        const sqlRejectOthers = `
          UPDATE delivery_request_partners 
          SET status = 'rejected' 
          WHERE request_id = ? AND partner_id != ?
        `;
        db.query(sqlRejectOthers, [request_id, partner_id]);

        // Mark this one as accepted
        const sqlAccept = `
          UPDATE delivery_request_partners 
          SET status = 'accepted' 
          WHERE request_id = ? AND partner_id = ?
        `;
        db.query(sqlAccept, [request_id, partner_id]);

        // ✅ Update order with assigned partner + delivery date + OTP
        const sqlUpdateOrder = `
          UPDATE orders 
          SET assigned_to = ?, delivery_date = NOW(), delivery_otp = ? 
          WHERE id = ?
        `;
        db.query(sqlUpdateOrder, [partner_id, otp, order_id], (err3) => {
          if (err3) return res.status(500).json({ error: err3.message });

          // TODO: send OTP to customer (SMS, Email, Push)
          res.json({
            success: true,
            message: "Request accepted successfully and order assigned",
            order_id,
            otp // ⚠️ return only for testing, in production send via SMS/Email
          });
        });
      });
    });
  } else {
    // Just mark rejected
    const sqlReject = `
      UPDATE delivery_request_partners 
      SET status = 'rejected' 
      WHERE request_id = ? AND partner_id = ?
    `;
    db.query(sqlReject, [request_id, partner_id], (err3) => {
      if (err3) return res.status(500).json({ error: err3.message });
      res.json({ success: true, message: "Request rejected" });
    });
  }
});

router.post('/delivery-partner/verify-otp', authenticate, (req, res) => {
  const partner_id = req.user.id;
  const { order_id, otp } = req.body;

  const sql = `SELECT delivery_otp, assigned_to FROM orders WHERE id = ?`;
  db.query(sql, [order_id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    if (rows.length === 0) return res.status(404).json({ error: "Order not found" });

    const order = rows[0];

    if (order.assigned_to !== partner_id) {
      return res.status(403).json({ error: "You are not assigned to this order" });
    }

    if (order.delivery_otp !== otp) {
      return res.status(400).json({ error: "Invalid OTP" });
    }

    // ✅ OTP matched → mark delivered
    const updateSql = `
      UPDATE orders 
      SET status = 'delivered', is_delivered = 1 
      WHERE id = ?
    `;
    db.query(updateSql, [order_id], (err2) => {
      if (err2) return res.status(500).json({ error: err2.message });
      res.json({ success: true, message: "Order marked as delivered" });
    });
  });
});

module.exports = router;
