const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const authenticate = require('../middleware/auth');


router.get('/delivery-orders', authenticate, (req, res) => {
  const assigned_to = req.user.id;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const sql = `
    SELECT 
      o.*, 
      p.name AS product_name, 
      p.images, 
      p.category,
      u.full_name AS vendor_name
    FROM orders o
    JOIN products p ON o.product_id = p.id
    LEFT JOIN users u ON o.vendor_id = u.id
    WHERE o.assigned_to = ?
    ORDER BY o.order_date DESC
  `;

  db.query(sql, [assigned_to], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });

    const upcoming = [];
    const past = [];
    const today = [];

    results.forEach(order => {
      const orderDate = new Date(order.order_date);

      const images = (() => {
        try {
          return JSON.parse(order.images || '[]').map(
            img => `${process.env.BASE_URL || 'http://localhost:3000'}/uploads/${img}`
          );
        } catch (e) {
          return [];
        }
      })();

      const formattedOrder = {
        ...order,
        images,
        product_name: order.product_name,
        vendor_name: order.vendor_name,
      };

      if (orderDate >= todayStart && orderDate <= todayEnd) {
        today.push(formattedOrder);
      } else if (orderDate > todayEnd) {
        upcoming.push(formattedOrder);
      } else {
        past.push(formattedOrder);
      }
    });

    res.json({ today_orders: today, upcoming_orders: upcoming, past_orders: past });
  });
});


// router.get('/delivery-orders', authenticate, (req, res) => {
//   const partner_id = req.user.id;

//   const todayStart = new Date();
//   todayStart.setHours(0, 0, 0, 0);
//   const todayEnd = new Date();
//   todayEnd.setHours(23, 59, 59, 999);

//   const sql = `
//     SELECT 
//       o.id AS order_id,
//       o.order_date,
//       o.delivery_date,
//       o.status,
//       p.name AS product_name, 
//       p.images, 
//       p.category,
//       v.full_name AS vendor_name,
//       ca.name AS customer_name,
//       ca.description AS customer_address,
//       ca.latitude,
//       ca.longitude
//     FROM orders o
//     JOIN products p ON o.product_id = p.id
//     JOIN users v ON o.vendor_id = v.id
//     LEFT JOIN customer_addresses ca ON o.customer_address_id = ca.id
//     WHERE o.assigned_to = ?
//     ORDER BY o.order_date DESC
//   `;

//   db.query(sql, [partner_id], (err, results) => {
//     if (err) return res.status(500).json({ error: err.message });

//     const upcoming = [];
//     const past = [];
//     const today = [];

//     results.forEach(order => {
//       const deliveryDate = new Date(order.delivery_date || order.order_date);

//       let images = [];
//       try {
//         images = JSON.parse(order.images || '[]').map(
//           img => `${process.env.BASE_URL || 'http://localhost:3000'}/uploads/${img}`
//         );
//       } catch (e) {}

//       const formattedOrder = {
//         order_id: order.order_id,
//         status: order.status,
//         order_date: order.order_date,
//         delivery_date: order.delivery_date,
//         product_name: order.product_name,
//         category: order.category,
//         vendor_name: order.vendor_name,
//         customer_name: order.customer_name,
//         customer_address: order.customer_address,
//         latitude: order.latitude,
//         longitude: order.longitude,
//         images
//       };

//       if (deliveryDate >= todayStart && deliveryDate <= todayEnd) {
//         today.push(formattedOrder);
//       } else if (deliveryDate > todayEnd) {
//         upcoming.push(formattedOrder);
//       } else {
//         past.push(formattedOrder);
//       }
//     });

//     res.json({ today_orders: today, upcoming_orders: upcoming, past_orders: past });
//   });
// });



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
    SELECT dr.id AS request_id, dr.order_id, dr.customer_id, dr.status,
           o.order_number, o.amount, o.customer_address, o.customer_city, o.customer_pincode
    FROM delivery_request_partners drp
    JOIN delivery_requests dr ON drp.request_id = dr.id
    JOIN orders o ON dr.order_id = o.id
    WHERE drp.partner_id = ? AND drp.status = 'pending' AND dr.status = 'pending'
  `;

  db.query(sql, [partner_id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.post('/delivery-partner/respond-request', authenticate, (req, res) => {
  const partner_id = req.user.id;
  const { request_id, action } = req.body; // action = "accept" or "reject"

  if (!['accept','reject'].includes(action)) {
    return res.status(400).json({ error: "Invalid action" });
  }

  if (action === 'accept') {
    const sqlCheck = `SELECT * FROM delivery_requests WHERE id = ? AND status = 'pending'`;
    db.query(sqlCheck, [request_id], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      if (rows.length === 0) return res.status(400).json({ error: "Request already assigned or expired" });

      const order_id = rows[0].order_id; // 👈 assume delivery_requests has order_id

      // Assign this partner
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

        // 👇 Also assign the order to this delivery partner
        const sqlUpdateOrder = `
          UPDATE orders 
          SET assigned_to = ?, status = 'assigned_to_partner' 
          WHERE id = ?
        `;
        db.query(sqlUpdateOrder, [partner_id, order_id], (err3) => {
          if (err3) return res.status(500).json({ error: err3.message });

          res.json({ success: true, message: "Request accepted and order assigned to delivery partner" });
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


module.exports = router;
