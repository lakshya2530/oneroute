const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const db = require('../db/connection');
const authenticate = require('../middleware/auth');
const razorpay = require("../config/razorpay"); // import config
const crypto = require("crypto");

// 🔧 Multer setup
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/shops/');
  },
  filename: function (req, file, cb) {
    const uniqueName = Date.now() + '-' + Math.floor(Math.random() * 1E9) + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const upload = multer({ storage });

// ✅ Create Shop API
router.post(
  '/vendor/shop-create',
  authenticate,
  upload.fields([
    { name: 'shop_document', maxCount: 1 },
    { name: 'additional_document', maxCount: 1 }
  ]),
  (req, res) => {
    const vendor_id = req.user.id;
    const { shop_name, address, gst_number, pan_number, owner_name } = req.body;
    const files = req.files;

    const data = {
      vendor_id,
      shop_name,
      address,
      gst_number,
      pan_number,
      owner_name,
      shop_document: files?.shop_document?.[0]?.filename || '',
      additional_document: files?.additional_document?.[0]?.filename || ''

    };

    db.query('INSERT INTO vendor_shops SET ?', data, (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Shop created successfully', id: result.insertId });
    });
  }
);

router.post(
  '/shop-image',
  upload.fields([
    { name: 'shop_image', maxCount: 1 }
  ]),
  (req, res) => {
    const { vendor_id } = req.body;
    const files = req.files;

    const data = {
      shop_image: files?.shop_image?.[0]?.filename || ''
    };

    const query = 'UPDATE vendor_shops SET ? WHERE vendor_id = ?';

    db.query(query, [data, vendor_id], (err, result) => {
      if (err) return res.status(500).json({ error: err.message });

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Shop not found' });
      }

      res.json({ message: 'Shop updated successfully' });
    });
  }
);


router.post(
  '/vendor/shop-document-create',
 // authenticate,
  upload.fields([
    { name: 'shop_document', maxCount: 1 },
    { name: 'additional_document', maxCount: 1 }
  ]),
  (req, res) => {
    //const vendor_id = req.user.id;
    const { gst_number, pan_number,vendor_id } = req.body;
    const files = req.files;

    const shop_document = files?.shop_document?.[0]?.filename || '';
    const additional_document = files?.additional_document?.[0]?.filename || '';

    // Build dynamic query based on which files are uploaded
    const updates = [];
    const values = [];

    if (gst_number) {
      updates.push('gst_number = ?');
      values.push(gst_number);
    }

    if (pan_number) {
      updates.push('pan_number = ?');
      values.push(pan_number);
    }

    if (shop_document) {
      updates.push('shop_document = ?');
      values.push(shop_document);
    }

    if (additional_document) {
      updates.push('additional_document = ?');
      values.push(additional_document);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(vendor_id); // Add vendor_id for WHERE clause

    const sql = `UPDATE vendor_shops SET ${updates.join(', ')} WHERE vendor_id = ?`;

    db.query(sql, values, (err, result) => {
      if (err) return res.status(500).json({ error: err.message });

      res.json({ message: 'Shop updated successfully' });
    });
  }
);

// ✅ Edit Shop API
router.put(
  '/vendor/shop-edit/:id',
  authenticate,
  upload.fields([
    { name: 'shop_document', maxCount: 1 },
    { name: 'additional_document', maxCount: 1 }
  ]),
  (req, res) => {
    const { id } = req.params;
    const vendor_id = req.user.id;
    const { shop_name, address, gst_number, pan_number, owner_name } = req.body;
    const files = req.files;

    const updatedData = {
      shop_name,
      address,
      gst_number,
      pan_number,
      owner_name
    };

    if (files?.shop_document) updatedData.shop_document = files.shop_document[0].filename;
    if (files?.additional_document) updatedData.additional_document = files.additional_document[0].filename;

    db.query(
      'UPDATE vendor_shops SET ? WHERE id = ? AND vendor_id = ?',
      [updatedData, id, vendor_id],
      (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Shop updated successfully' });
      }
    );
  }
);

router.post('/vendor/booking-action', authenticate, (req, res) => {
  const vendor_id = req.user.id;
  const { booking_id, action, cancel_reason } = req.body;

  if (!booking_id || !action) {
    return res.status(400).json({ error: 'Booking ID and action are required' });
  }

  if (action === 'reject' && !cancel_reason) {
    return res.status(400).json({ error: 'Cancel reason required when rejecting' });
  }

  // Verify vendor owns this booking
  const checkSql = `
    SELECT b.id, s.vendor_id 
    FROM bookings b
    JOIN services s ON b.service_id = s.id
    WHERE b.id = ?
  `;
  db.query(checkSql, [booking_id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!results.length) return res.status(404).json({ error: 'Booking not found' });

    if (results[0].vendor_id !== vendor_id) {
      return res.status(403).json({ error: 'Not authorized for this booking' });
    }

    // Update booking status
    let newStatus = '';
    let params = [];
    if (action === 'accept') {
      newStatus = 'accepted';
      params = [newStatus, null, booking_id];
    } else if (action === 'reject') {
      newStatus = 'rejected';
      params = [newStatus, cancel_reason, booking_id];
    } else {
      return res.status(400).json({ error: 'Invalid action' });
    }

    const updateSql = `
      UPDATE bookings 
      SET status = ?, cancel_reason = ? 
      WHERE id = ?
    `;
    db.query(updateSql, params, (err2) => {
      if (err2) return res.status(500).json({ error: err2.message });

      res.json({
        status: true,
        message: `Booking ${newStatus} successfully`,
        booking_id,
        new_status: newStatus,
        cancel_reason: action === 'reject' ? cancel_reason : null
      });
    });
  });
});

router.get('/vendor/bookings', authenticate, (req, res) => {
  const vendor_id = req.user.id;

  const sql = `
    SELECT 
      b.id AS booking_id,
      b.status,
      b.cancel_reason,
      b.created_at,
      b.slot_id, -- JSON / stringified array
      u.full_name AS customer_name,
      u.phone AS customer_phone,
      s.service_name,
      s.price,
      s.service_type,
      s.location,
      s.meet_link,
      ca.name AS address_name,
      ca.description AS address
    FROM bookings b
    JOIN services s ON b.service_id = s.id
    JOIN users u ON b.customer_id = u.id
    JOIN customer_addresses ca ON b.address_id = ca.id
    WHERE s.vendor_id = ?
    ORDER BY b.id DESC
  `;

  db.query(sql, [vendor_id], async (err, bookings) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!bookings.length) {
      return res.json({
        status: true,
        message: 'No bookings found',
        data: []
      });
    }

    const promises = bookings.map(booking => {
      return new Promise((resolve, reject) => {
        let slotIds = [];

        // Parse slot_id into array
        try {
          if (typeof booking.slot_id === 'string') {
            slotIds = JSON.parse(booking.slot_id);
          } else {
            slotIds = booking.slot_id;
          }
          if (!Array.isArray(slotIds)) slotIds = [];
          slotIds = slotIds.map(id => parseInt(id));
        } catch (e) {
          slotIds = [];
        }

        if (slotIds.length === 0) {
          booking.slots = [];
          delete booking.slot_id;
          return resolve(booking);
        }

        const slotSql = `
          SELECT id AS slot_id, slot_date, slot_time
          FROM service_slots
          WHERE id IN (?)
        `;
        db.query(slotSql, [slotIds], (err2, slotResults) => {
          if (err2) return reject(err2);
          booking.slots = slotResults;
          delete booking.slot_id;
          resolve(booking);
        });
      });
    });

    Promise.all(promises)
      .then(data => {
        res.json({
          status: true,
          message: 'Vendor bookings fetched successfully',
          data
        });
      })
      .catch(err3 => {
        res.status(500).json({ error: err3.message });
      });
  });
});


router.get('/vendor/transactions', authenticate, (req, res) => {
  const vendor_id = req.user.id;

  const sql = `
    SELECT 
      t.id AS transaction_id,
      t.transaction_type,
      t.amount,
      t.status,
      t.razorpay_order_id,
      t.razorpay_payment_id,
      t.created_at,
      CASE 
        WHEN t.transaction_type = 'service' THEN s.service_name
        WHEN t.transaction_type = 'order' THEN 'Product Order'
      END AS reference_name,
      CASE 
        WHEN t.transaction_type = 'service' THEN b.id
        WHEN t.transaction_type = 'order' THEN o.id
      END AS reference_id
    FROM transactions t
    LEFT JOIN bookings b ON t.booking_id = b.id
    LEFT JOIN services s ON b.service_id = s.id
    LEFT JOIN orders o ON t.order_id = o.id
    LEFT JOIN order_items oi ON o.id = oi.order_id
    WHERE 
      (s.vendor_id = ? AND t.transaction_type = 'service')
      OR (oi.vendor_id = ? AND t.transaction_type = 'order')
    GROUP BY t.id
    ORDER BY t.id DESC
  `;

  db.query(sql, [vendor_id, vendor_id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({
      status: true,
      message: 'Vendor transactions fetched successfully',
      data: results
    });
  });
});



// ✅ Get Shop API
router.get('/vendor/shop', authenticate, (req, res) => {
  const vendor_id = req.user.id;

  db.query(
    `SELECT *
    FROM vendor_shops WHERE vendor_id = ? LIMIT 1`,
    [vendor_id],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(result[0] || {});
    }
  );
});

router.get('/vendor-orders', authenticate, (req, res) => {
    const vendor_id = req.user.id;
    const now = new Date();
  
    const sql = `
      SELECT o.*,o.id as order_id,oi.price as order_price, p.name AS product_name, c.full_name AS customer_name
      FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      JOIN products p ON o.product_id = p.id
      JOIN users c ON o.customer_id = c.id
      WHERE p.vendor_id = ?
    `;
  
    db.query(sql, [vendor_id], (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
  
      const upcoming = [];
      const past = [];
  
      results.forEach(order => {
        const orderDate = new Date(order.delivery_date || order.order_date);
        (orderDate >= now ? upcoming : past).push(order);
      });
  
      res.json({ upcoming_orders: upcoming, past_orders: past });
    });
  });

  router.get('/vendor-orders/:order_id', authenticate, (req, res) => {
    const vendor_id = req.user.id;
    const { order_id } = req.params;
  
    const sql = `
      SELECT 
        o.id AS order_id, 
        o.order_number, 
        o.status, 
        o.order_date, 
        c.id AS customer_id, 
        c.full_name AS customer_name, 
        c.phone AS customer_mobile, 
        o.customer_latitude AS customer_lat,
        o.customer_longitude AS customer_long,
        s.id AS shop_id,
        s.latitude AS shop_lat,
        s.longitude AS shop_long,
        oi.id AS item_id, 
        oi.quantity, 
        oi.price, 
        p.id AS product_id, 
        p.name AS product_name, 
        p.images
      FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      JOIN products p ON oi.product_id = p.id
      JOIN users c ON o.customer_id = c.id
      JOIN vendor_shops s ON oi.vendor_id = s.vendor_id
      WHERE o.id = ? AND oi.vendor_id = ?
    `;
  
    db.query(sql, [order_id, vendor_id], (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      if (results.length === 0) return res.status(404).json({ error: "Order not found" });
  
      const orderInfo = {
        order_id: results[0].order_id,
        order_number: results[0].order_number,
        status: results[0].status,
        order_date: results[0].order_date,
        customer_lat: results[0].customer_lat,
        customer_long: results[0].customer_long,
        shop_lat: results[0].shop_lat,
        shop_long: results[0].shop_long,
        delivery_option: null, // 👈 default
        customer: {
          id: results[0].customer_id,
          name: results[0].customer_name,
          mobile: results[0].customer_mobile
        },
        items: results.map(r => ({
          item_id: r.item_id,
          product_id: r.product_id,
          product_name: r.product_name,
          quantity: r.quantity,
          price: r.price,
          images: (() => {
            try {
              return JSON.parse(r.images || '[]');
            } catch (e) {
              return [];
            }
          })()
        }))
      };
  
      // ✅ distance calc
      const shopLat = parseFloat(results[0].shop_lat);
      const shopLng = parseFloat(results[0].shop_long);
      const custLat = parseFloat(results[0].customer_lat);
      const custLng = parseFloat(results[0].customer_long);

      function haversine(lat1, lon1, lat2, lon2) {
        function toRad(x) {
          return (x * Math.PI) / 180;
        }
      
        const R = 6371; // Earth radius in km
        const dLat = toRad(lat2 - lat1);
        const dLon = toRad(lon2 - lon1);
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(toRad(lat1)) *
            Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);
      
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c; // distance in km
      }
      
  
      const distance = haversine(shopLat, shopLng, custLat, custLng);
  
      if (distance <= 50) {
        orderInfo.delivery_option = "assign_to_partner"; // vendor will click assign
      } else {
        orderInfo.delivery_option = "ship_api"; // auto-ship
      }
  
      res.json(orderInfo);
    });
  });
  
  router.post('/vendor/assign-delivery/:order_id', authenticate, (req, res) => {
    const vendor_id = req.user.id;
    const { order_id } = req.params;
  
    // Step 1: Get order & shop info
    const sqlOrder = `
      SELECT o.id AS order_id, o.customer_latitude, o.customer_longitude, 
             s.id AS shop_id, s.latitude AS shop_lat, s.longitude AS shop_lng, 
             o.customer_id
      FROM orders o
      JOIN vendor_shops s ON o.vendor_id = s.vendor_id
      WHERE o.id = ? AND o.vendor_id = ?
    `;
    db.query(sqlOrder, [order_id, vendor_id], (err, orderRows) => {
      if (err) return res.status(500).json({ error: err.message });
      if (orderRows.length === 0) return res.status(404).json({ error: "Order not found" });
  
      const order = orderRows[0];
  
      // Step 2: Find partners within 30 km of shop
      const sqlPartners = `SELECT * FROM delivery_partner_locations`;
      db.query(sqlPartners, (err2, partners) => {
        if (err2) return res.status(500).json({ error: err2.message });
  
        const nearbyPartners = partners.filter(p => {
          return getDistanceFromLatLonInKm(
            order.shop_lat, order.shop_lng, p.latitude, p.longitude
          ) <= 30;
        });
  
        if (nearbyPartners.length === 0) {
          return res.status(200).json({ message: "No delivery partners in range, fallback to shipping API" });
        }
  
        // Step 3: Insert into delivery_requests
        const insertReq = `
          INSERT INTO delivery_requests (order_id, shop_id, customer_id)
          VALUES (?, ?, ?)
        `;
        db.query(insertReq, [order.order_id, order.shop_id, order.customer_id], (err3, reqResult) => {
          if (err3) return res.status(500).json({ error: err3.message });
  
          const request_id = reqResult.insertId;
  
          // Step 4: Insert into delivery_request_partners
          const reqPartners = nearbyPartners.map(p => [request_id, p.partner_id]);
          db.query(
            `INSERT INTO delivery_request_partners (request_id, partner_id) VALUES ?`,
            [reqPartners],
            (err4) => {
              if (err4) return res.status(500).json({ error: err4.message });
  
              res.json({
                success: true,
                message: "Delivery request sent to nearby partners",
                request_id,
                partners_notified: nearbyPartners.length
              });
            }
          );
        });
      });
    });
  });
  
  // helper to calculate distance
  // function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  //   function deg2rad(deg) {
  //     return deg * (Math.PI/180);
  //   }
  //   const R = 6371; // km
  //   const dLat = deg2rad(lat2-lat1);
  //   const dLon = deg2rad(lon2-lon1); 
  //   const a = 
  //     Math.sin(dLat/2) * Math.sin(dLat/2) +
  //     Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
  //     Math.sin(dLon/2) * Math.sin(dLon/2); 
  //   const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  //   return R * c;
  // }
  
  // helper to calculate distance
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  function deg2rad(deg) {
    return deg * (Math.PI/180);
  }
  const R = 6371; // km
  const dLat = deg2rad(lat2-lat1);
  const dLon = deg2rad(lon2-lon1); 
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  return R * c;
}
  
  // router.get('/vendor-orders/:order_id', authenticate, (req, res) => {
  //   const vendor_id = req.user.id;
  //   const { order_id } = req.params;
  //   const baseUrl = `${req.protocol}://${req.get('host')}/uploads`;
  
  //   const sql = `
  //     SELECT 
  //       o.id AS order_id, 
  //       o.order_number, 
  //       o.status, 
  //       o.order_date, 
  //       c.id AS customer_id, 
  //       c.full_name AS customer_name, 
  //       c.phone AS customer_mobile, 
  //       oi.id AS item_id, 
  //       oi.quantity, 
  //       oi.price, 
  //       p.id AS product_id, 
  //       p.name AS product_name, 
  //       p.images
  //     FROM orders o
  //     JOIN order_items oi ON o.id = oi.order_id
  //     JOIN products p ON oi.product_id = p.id
  //     JOIN users c ON o.customer_id = c.id
  //     WHERE o.id = ? AND oi.vendor_id = ?
  //   `;
  
  //   db.query(sql, [order_id, vendor_id], (err, results) => {
  //     if (err) return res.status(500).json({ error: err.message });
  //     if (results.length === 0) return res.status(404).json({ error: "Order not found" });
  
  //     const orderInfo = {
  //       order_id: results[0].order_id,
  //       order_number: results[0].order_number,
  //       status: results[0].status,
  //       order_date: results[0].order_date,
  //       customer: {
  //         id: results[0].customer_id,
  //         name: results[0].customer_name,
  //         mobile: results[0].customer_mobile
  //       },
  //       items: results.map(r => ({
  //         item_id: r.item_id,
  //         product_id: r.product_id,
  //         product_name: r.product_name,
  //         quantity: r.quantity,
  //         price: r.price,
  //         images: (() => {
  //           try {
  //             return JSON.parse(r.images || '[]').map(img => `${baseUrl}/products/${img}`);
  //           } catch (e) {
  //             return [];
  //           }
  //         })()
  //       }))
  //     };
  
  //     res.json(orderInfo);
  //   });
  // });


  router.post('/vendor-orders/:order_id/status', authenticate, (req, res) => {
    const vendor_id = req.user.id;
    const { order_id } = req.params;
    const { status, cancel_reason } = req.body;
  
    // Allowed statuses
    const allowedStatuses = ["accepted", "packed", "shipped", "delivered", "cancelled"];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }
  
    // Ensure vendor is authorized
    const checkSql = `SELECT * FROM order_items WHERE order_id = ? AND vendor_id = ?`;
    db.query(checkSql, [order_id, vendor_id], (err, items) => {
      if (err) return res.status(500).json({ error: err.message });
      if (items.length === 0) return res.status(403).json({ error: "Not authorized for this order" });
  
      let updateSql = `UPDATE orders SET status = ?`;
      const values = [status, order_id];
  
      if (status === "cancelled") {
        if (!cancel_reason || cancel_reason.trim() === "") {
          return res.status(400).json({ error: "Cancel reason is required" });
        }
        updateSql = `UPDATE orders SET status = ?, cancel_reason = ? WHERE id = ?`;
        values.splice(1, 0, cancel_reason); // insert cancel_reason in values
      } else {
        updateSql += ` WHERE id = ?`;
      }
  
      db.query(updateSql, values, (err2) => {
        if (err2) return res.status(500).json({ error: err2.message });
        res.json({ 
          message: "Order status updated", 
          order_id, 
          new_status: status, 
          cancel_reason: status === "cancelled" ? cancel_reason : undefined 
        });
      });
    });
  });
  

  router.post('/product-request-set/:id/bid-payment', authenticate, (req, res) => {
    const vendor_id = req.user.id;   // vendor paying
    const { id: request_set_id } = req.params;
  
    // Step 1: Get sub_bid_price from request set
    const sql = `SELECT sub_bid_price FROM product_request_sets WHERE id = ?`;
    db.query(sql, [request_set_id], (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      if (result.length === 0) return res.status(404).json({ error: "Request set not found" });
  
      const bidPrice = result[0].sub_bid_price;
  
      // Step 2: Create Razorpay Order
      const options = {
        amount: bidPrice * 100, // Razorpay expects amount in paise
        currency: "INR",
        receipt: `bid_${request_set_id}_${Date.now()}`
      };
  
      razorpay.orders.create(options, (err2, order) => {
        if (err2) return res.status(500).json({ error: "Razorpay order creation failed", details: err2 });
  
        // Step 3: Insert into transactions table
        const txnSql = `
          INSERT INTO transactions 
          (transaction_type, request_set_id, vendor_id, razorpay_order_id, amount, currency, status) 
          VALUES ('bid', ?, ?, ?, ?, 'INR', 'pending')
        `;
        db.query(txnSql, [request_set_id, vendor_id, order.id, bidPrice], (err3, txnResult) => {
          if (err3) return res.status(500).json({ error: err3.message });
  
          res.json({
            status: true,
            message: "Bid payment initiated. Complete payment with Razorpay.",
            razorpay_order: order,
            transaction_id: txnResult.insertId,
            request_set_id,
            vendor_id,
            amount: bidPrice
          });
        });
      });
    });
  });

  router.post('/bid-payment/verify', authenticate, (req, res) => {
    const vendor_id = req.user.id;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: "Payment verification failed. Missing params." });
    }
  
    // Step 1: Generate expected signature
    const hmac = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET);
    hmac.update(razorpay_order_id + "|" + razorpay_payment_id);
    const expectedSignature = hmac.digest("hex");
  
    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ error: "Invalid payment signature" });
    }
  
    // Step 2: Update transaction record
    const updateSql = `
      UPDATE transactions 
      SET razorpay_payment_id=?, razorpay_signature=?, status='success'
      WHERE razorpay_order_id=? AND vendor_id=? AND transaction_type='bid'
    `;
    db.query(updateSql, [razorpay_payment_id, razorpay_signature, razorpay_order_id, vendor_id], (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      if (result.affectedRows === 0) return res.status(404).json({ error: "Transaction not found" });
  
      res.json({
        status: true,
        message: "Bid payment verified successfully",
        razorpay_order_id,
        razorpay_payment_id
      });
    });
  });

  router.post('/product-request-set/:id/bid', authenticate, (req, res) => {
    const vendor_id = req.user.id;
    const { id: request_set_id } = req.params;
    const { price, description, delivery_time_days, additional_requirements } = req.body;
  
    const sql = `
      INSERT INTO product_bids 
      (request_set_id, vendor_id, price, description, delivery_time_days, additional_requirements) 
      VALUES (?, ?, ?, ?, ?, ?)
    `;
  
    db.query(
      sql,
      [request_set_id, vendor_id, price, description, delivery_time_days, additional_requirements],
      (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
  
        res.json({
          message: "Bid placed successfully",
          bid_id: result.insertId,
          vendor_id,
          request_set_id
        });
      }
    );
  });

  // Withdraw a vendor bid
  router.post('/product-bids/:bid_id/withdraw', authenticate, (req, res) => {
    const vendor_id = req.user.id;
    const { bid_id } = req.params;

    const sql = `
      UPDATE product_bids 
      SET status = 'withdrawn' 
      WHERE id = ? AND vendor_id = ?
    `;

    db.query(sql, [bid_id, vendor_id], (err, result) => {
      if (err) return res.status(500).json({ error: err.message });

      if (result.affectedRows === 0) {
        return res.status(400).json({ error: "Bid not found or already withdrawn" });
      }

      res.json({ message: "Bid withdrawn successfully" });
    });
  });


  // router.get('/vendor/product-requests', authenticate, (req, res) => {
  //   const vendor_id = req.user.id;
  
  //   const sql = `
  //     SELECT prs.id AS request_set_id, prs.request_title, prs.request_description,
  //            prs.min_price, prs.max_price, prs.estimated_delivery_days,
  //            prs.category_id, prs.subcategory_id,
  //            pr.id AS product_id, pr.product_title, pr.product_description, pr.images
  //     FROM product_request_sets prs
  //     JOIN product_request_items pr ON prs.id = pr.request_set_id
  //     JOIN users v ON v.id = ?
  //     WHERE prs.category_id = v.category_id
  //       AND FIND_IN_SET(prs.subcategory_id, v.subcategory_ids)
  //     ORDER BY prs.created_at DESC
  //   `;
  
  //   db.query(sql, [vendor_id], (err, results) => {
  //     if (err) return res.status(500).json({ error: err.message });
  
  //     // Group by request_set
  //     const requestMap = {};
  //     results.forEach(row => {
  //       if (!requestMap[row.request_set_id]) {
  //         requestMap[row.request_set_id] = {
  //           request_set_id: row.request_set_id,
  //           request_title: row.request_title,
  //           request_description: row.request_description,
  //           min_price: row.min_price,
  //           max_price: row.max_price,
  //           estimated_delivery_days: row.estimated_delivery_days,
  //           category_id: row.category_id,
  //           subcategory_id: row.subcategory_id,
  //           products: []
  //         };
  //       }
  //       requestMap[row.request_set_id].products.push({
  //         product_id: row.product_id,
  //         product_title: row.product_title,
  //         product_description: row.product_description,
  //         images: JSON.parse(row.images || '[]')
  //       });
  //     });
  
  //     res.json(Object.values(requestMap));
  //   });
  // });
  
//   router.get('/vendor/product-requests', authenticate, (req, res) => {
//   const vendor_id = req.user.id;

//   const sql = `
//     SELECT prs.id AS request_set_id, prs.request_title, prs.request_description,
//            prs.min_price, prs.max_price, prs.estimated_delivery_days,
//            prs.category_id, prs.subcategory_id,
//            pr.id AS product_id, pr.product_title, pr.product_description, pr.images,
//            IF(pb.id IS NOT NULL, 1, 0) AS already_bid
//     FROM product_request_sets prs
//     JOIN product_request_items pr ON prs.id = pr.request_set_id
//     JOIN users v ON v.id = ?
//     LEFT JOIN product_bids pb 
//            ON pb.request_set_id = prs.id AND pb.vendor_id = v.id
//     WHERE prs.category_id = v.category_id
//       AND FIND_IN_SET(prs.subcategory_id, v.subcategory_ids)
//     ORDER BY prs.created_at DESC
//   `;

//   db.query(sql, [vendor_id], (err, results) => {
//     if (err) return res.status(500).json({ error: err.message });

//     const requestMap = {};
//     results.forEach(row => {
//       if (!requestMap[row.request_set_id]) {
//         requestMap[row.request_set_id] = {
//           request_set_id: row.request_set_id,
//           request_title: row.request_title,
//           request_description: row.request_description,
//           min_price: row.min_price,
//           max_price: row.max_price,
//           estimated_delivery_days: row.estimated_delivery_days,
//           category_id: row.category_id,
//           subcategory_id: row.subcategory_id,
//           already_bid: !!row.already_bid,
//           products: []
//         };
//       }
//       requestMap[row.request_set_id].products.push({
//         product_id: row.product_id,
//         product_title: row.product_title,
//         product_description: row.product_description,
//         images: (() => {
//           try {
//             return JSON.parse(row.images || "[]");
//           } catch {
//             return [];
//           }
//         })()
//       });
//     });

//     res.json(Object.values(requestMap));
//   });
// });

router.get('/vendor/product-requests', authenticate, (req, res) => {
  const vendor_id = req.user.id;

  const sql = `
    SELECT prs.id AS request_set_id, prs.request_title, prs.request_description,
           prs.min_price, prs.max_price, prs.estimated_delivery_days,
           prs.category_id, prs.subcategory_id, prs.sub_bid_price,
           pr.id AS product_id, pr.product_title, pr.product_description, pr.images,
           IF(pb.id IS NOT NULL, 1, 0) AS already_bid,
           IF(t.id IS NOT NULL AND pb.id IS NULL, 1, 0) AS paid_but_not_bid,
           vr.free_bids
    FROM product_request_sets prs
    JOIN product_request_items pr ON prs.id = pr.request_set_id
    JOIN users v ON v.id = ?
    LEFT JOIN product_bids pb 
           ON pb.request_set_id = prs.id AND pb.vendor_id = v.id
    LEFT JOIN transactions t 
           ON t.request_set_id = prs.id 
          AND t.vendor_id = v.id 
          AND t.transaction_type = 'bid' 
          AND t.status = 'success'
    LEFT JOIN vendor_rewards vr
           ON vr.vendor_id = v.id
    WHERE prs.category_id = v.category_id
      AND FIND_IN_SET(prs.subcategory_id, v.subcategory_ids)
    ORDER BY prs.created_at DESC
  `;

  db.query(sql, [vendor_id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });

    const requestMap = {};
    results.forEach(row => {
      if (!requestMap[row.request_set_id]) {
        requestMap[row.request_set_id] = {
          request_set_id: row.request_set_id,
          request_title: row.request_title,
          request_description: row.request_description,
          min_price: row.min_price,
          max_price: row.max_price,
          estimated_delivery_days: row.estimated_delivery_days,
          category_id: row.category_id,
          subcategory_id: row.subcategory_id,
          sub_bid_price: row.sub_bid_price,
          already_bid: !!row.already_bid,
          paid_but_not_bid: !!row.paid_but_not_bid,
          free_bids: row.free_bids || 0,   // ✅ show free bids
          products: []
        };
      }
      requestMap[row.request_set_id].products.push({
        product_id: row.product_id,
        product_title: row.product_title,
        product_description: row.product_description,
        images: (() => {
          try {
            return JSON.parse(row.images || "[]");
          } catch {
            return [];
          }
        })()
      });
    });

    res.json(Object.values(requestMap));
  });
});




router.get('/vendor/my-bids', authenticate, (req, res) => {
  const vendor_id = req.user.id;

  const sql = `
    SELECT 
      pb.id AS bid_id, pb.price, pb.description, pb.delivery_time_days, pb.additional_requirements,
      prs.id AS request_set_id, prs.request_title, prs.request_description,
      prs.min_price, prs.max_price, prs.estimated_delivery_days,
      prs.category_id, prs.subcategory_id,
      prs.customer_id,
      u.full_name AS customer_name,
      pr.id AS product_id, pr.product_title, pr.product_description, pr.images
    FROM product_bids pb
    JOIN product_request_sets prs ON pb.request_set_id = prs.id
    JOIN users u ON prs.customer_id = u.id
    JOIN product_request_items pr ON prs.id = pr.request_set_id
    WHERE pb.vendor_id = ?
    ORDER BY pb.created_at DESC
  `;

  db.query(sql, [vendor_id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });

    const bidMap = {};
    results.forEach(row => {
      if (!bidMap[row.bid_id]) {
        bidMap[row.bid_id] = {
          bid_id: row.bid_id,
          price: row.price,
          description: row.description,
          delivery_time: row.delivery_time_days,
          additional_requirements: row.additional_requirements,
          request_set_id: row.request_set_id,
          request_title: row.request_title,
          request_description: row.request_description,
          min_price: row.min_price,
          max_price: row.max_price,
          estimated_delivery_days: row.estimated_delivery_days,
          category_id: row.category_id,
          subcategory_id: row.subcategory_id,
          customer_id: row.customer_id,
          customer_name: row.customer_name,
          products: []
        };
      }
      bidMap[row.bid_id].products.push({
        product_id: row.product_id,
        product_title: row.product_title,
        product_description: row.product_description,
        images: (() => {
          try {
            return JSON.parse(row.images || "[]");
          } catch {
            return [];
          }
        })()
      });
    });

    res.json(Object.values(bidMap));
  });
});




  router.post('/vendor/save-categories', authenticate, (req, res) => {
    const vendor_id = req.user.id;
    const { category_id, subcategory_ids } = req.body; // [2,3,5]
  
    const subIds = subcategory_ids.join(','); 
  
    const sql = 'UPDATE users SET category_id = ?, subcategory_ids = ? WHERE id = ?';
    db.query(sql, [category_id, subIds, vendor_id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: "Categories & Subcategories saved successfully" });
    });
  });
  
  
  router.get('/vendor-analytics', authenticate, (req, res) => {
    const vendor_id = req.user.id;
  
    const sql = `
      SELECT 
        COUNT(*) AS total_orders,
        SUM(price) AS total_revenue,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_orders,
        SUM(CASE WHEN status = 'shipped' THEN 1 ELSE 0 END) AS shipped_orders,
        SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) AS delivered_orders
      FROM orders
      WHERE vendor_id = ?
    `;
  
    db.query(sql, [vendor_id], (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
  
      const stats = results[0] || {};
      res.json({
        total_orders: stats.total_orders || 0,
        total_revenue: stats.total_revenue || 0,
        pending_orders: stats.pending_orders || 0,
        shipped_orders: stats.shipped_orders || 0,
        delivered_orders: stats.delivered_orders || 0
      });
    });
  });
  
//   router.post('/create-service', (req, res) => {
//     const { sub_category_id, service_description, price, approx_time, vendor_id } = req.body;

//     if (!sub_category_id || !service_description || !price || !approx_time || !vendor_id) {
//         return res.status(400).json({ error: 'All fields are required' });
//     }

    
//     // 1. Get the service name from subcategory
//     const subCategoryQuery = 'SELECT name FROM service_subcategories WHERE id = ?';
//     db.query(subCategoryQuery, [sub_category_id], (err, subResults) => {
//         if (err) return res.status(500).json({ error: 'Database error' });
//         if (subResults.length === 0) return res.status(404).json({ error: 'Subcategory not found' });

//         const service_name = subResults[0].name;

//         // 2. Insert into services table
//         const insertQuery = `INSERT INTO services 
//             (sub_category_id, service_name, service_description, price, approx_time, vendor_id)
//             VALUES (?, ?, ?, ?, ?, ?)`;

//         const values = [sub_category_id, service_name, service_description, price, approx_time, vendor_id];

//         db.query(insertQuery, values, (err2, result) => {
//             if (err2) return res.status(500).json({ error: 'Failed to create service' });

//             res.json({
//                 message: 'Service created successfully',
//                 service_id: result.insertId,
//                 service_name,
//             });
//         });
//     });
// });

// router.get('/services-list', (req, res) => {
//   const { vendor_id } = req.query;

//   let sql = `
//     SELECT 
//       s.id AS service_id,
//       s.service_name,
//       s.service_description,
//       s.price,
//       s.approx_time,
//       s.vendor_id,
//       sc.name AS subcategory_name,
//       sc.image AS subcategory_image
//     FROM services s
//     LEFT JOIN service_subcategories sc ON s.sub_category_id = sc.id
//     WHERE 1=1
//   `;

//   const params = [];

//   if (vendor_id) {
//     sql += ' AND s.vendor_id = ?';
//     params.push(vendor_id);
//   }

//   sql += ' ORDER BY s.id DESC';

//   db.query(sql, params, (err, results) => {
//     if (err) return res.status(500).json({ error: 'Database error', details: err });
//     res.json({
//       status: true,
//       message: 'Services fetched successfully',
//       data: results,
//     });
//   });
// });

router.post('/create-service', (req, res) => {
  const { 
    sub_category_id, 
    service_description, 
    price, 
    approx_time, 
    vendor_id,
    service_type,   // "one_time" or "scheduled"
    location,       // "onsite", "customer_site", "google_meet"
    meet_link,      // required if google_meet
    slots           // array of { date: "YYYY-MM-DD", time: "HH:MM:SS" }
  } = req.body;

  // Validate
  if (!sub_category_id || !service_description || !price || !approx_time || !vendor_id || !service_type || !location) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  if (location === "google_meet" && !meet_link) {
    return res.status(400).json({ error: 'Meet link required for Google Meet location' });
  }

  // 1. Get service name from subcategory
  const subCategoryQuery = 'SELECT name FROM service_subcategories WHERE id = ?';
  db.query(subCategoryQuery, [sub_category_id], (err, subResults) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (subResults.length === 0) return res.status(404).json({ error: 'Subcategory not found' });

    const service_name = subResults[0].name;

    // 2. Insert into services
    const insertQuery = `
      INSERT INTO services 
        (sub_category_id, service_name, service_description, price, approx_time, vendor_id, service_type, location, meet_link)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [sub_category_id, service_name, service_description, price, approx_time, vendor_id, service_type, location, meet_link || null];

    db.query(insertQuery, values, (err2, result) => {
      if (err2) return res.status(500).json({ error: 'Failed to create service' });

      const service_id = result.insertId;

      // 3. If scheduled → insert slots
      if (service_type === "scheduled" && Array.isArray(slots) && slots.length > 0) {
        const slotValues = slots.map(s => [service_id, s.date, s.time]);
        const slotQuery = `INSERT INTO service_slots (service_id, slot_date, slot_time) VALUES ?`;

        db.query(slotQuery, [slotValues], (err3) => {
          if (err3) return res.status(500).json({ error: 'Failed to save slots' });

          return res.json({
            message: 'Service created successfully with slots',
            service_id,
            service_name,
          });
        });
      } else {
        return res.json({
          message: 'Service created successfully',
          service_id,
          service_name,
        });
      }
    });
  });
});


router.get('/services-list', (req, res) => {
  const { vendor_id } = req.query;

  let sql = `
    SELECT 
      s.id AS service_id,
      s.service_name,
      s.service_description,
      s.price,
      s.approx_time,
      s.vendor_id,
      s.service_type,
      s.location,
      s.meet_link,
      sc.name AS subcategory_name,
      sc.image AS subcategory_image
    FROM services s
    LEFT JOIN service_subcategories sc ON s.sub_category_id = sc.id
  `;

  const params = [];
  if (vendor_id) {
    sql += ' AND s.vendor_id = ?';
    params.push(vendor_id);
  }
  sql += ' ORDER BY s.id DESC';

  db.query(sql, params, (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error', details: err });

    if (results.length === 0) {
      return res.json({ status: true, message: 'No services found', data: [] });
    }

    // Get slots for scheduled services
    const serviceIds = results.map(r => r.service_id);
    const slotQuery = `SELECT * FROM service_slots WHERE service_id IN (?)`;

    db.query(slotQuery, [serviceIds], (err2, slotResults) => {
      if (err2) return res.status(500).json({ error: 'Failed to fetch slots' });

      const slotsMap = {};
      slotResults.forEach(slot => {
        if (!slotsMap[slot.service_id]) slotsMap[slot.service_id] = [];
        slotsMap[slot.service_id].push({id:slot.id, date: slot.slot_date, time: slot.slot_time });
      });

      const finalResults = results.map(service => ({
        ...service,
        slots: service.service_type === "scheduled" ? (slotsMap[service.service_id] || []) : []
      }));

      res.json({
        status: true,
        message: 'Services fetched successfully',
        data: finalResults,
      });
    });
  });
});

router.put('/update-service/:id', (req, res) => {
  const service_id = req.params.id;
  const {
    sub_category_id,
    service_description,
    price,
    approx_time,
    vendor_id,
    service_type,
    location,
    meet_link,
    slots // array of { date, time }
  } = req.body;

  if (!sub_category_id || !service_description || !price || !approx_time || !vendor_id || !service_type || !location) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  if (location === "google_meet" && !meet_link) {
    return res.status(400).json({ error: 'Meet link required for Google Meet location' });
  }

  // 1. Get service name from subcategory
  const subCategoryQuery = 'SELECT name FROM service_subcategories WHERE id = ?';
  db.query(subCategoryQuery, [sub_category_id], (err, subResults) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (subResults.length === 0) return res.status(404).json({ error: 'Subcategory not found' });

    const service_name = subResults[0].name;

    // 2. Update services table
    const updateQuery = `
      UPDATE services SET 
        sub_category_id = ?, 
        service_name = ?, 
        service_description = ?, 
        price = ?, 
        approx_time = ?, 
        vendor_id = ?, 
        service_type = ?, 
        location = ?, 
        meet_link = ?
      WHERE id = ?
    `;
    const values = [sub_category_id, service_name, service_description, price, approx_time, vendor_id, service_type, location, meet_link || null, service_id];

    db.query(updateQuery, values, (err2) => {
      if (err2) return res.status(500).json({ error: 'Failed to update service' });

      // 3. If scheduled → update slots
      if (service_type === "scheduled" && Array.isArray(slots)) {
        // First delete old slots
        db.query('DELETE FROM service_slots WHERE service_id = ?', [service_id], (err3) => {
          if (err3) return res.status(500).json({ error: 'Failed to update slots' });

          if (slots.length > 0) {
            const slotValues = slots.map(s => [service_id, s.date, s.time]);
            const slotQuery = `INSERT INTO service_slots (service_id, slot_date, slot_time) VALUES ?`;

            db.query(slotQuery, [slotValues], (err4) => {
              if (err4) return res.status(500).json({ error: 'Failed to insert new slots' });

              return res.json({ message: 'Service updated successfully with slots', service_id });
            });
          } else {
            return res.json({ message: 'Service updated successfully (slots cleared)', service_id });
          }
        });
      } else {
        // If not scheduled, remove any old slots
        db.query('DELETE FROM service_slots WHERE service_id = ?', [service_id], () => {
          return res.json({ message: 'Service updated successfully', service_id });
        });
      }
    });
  });
});


router.delete('/delete-service/:id', (req, res) => {
  const service_id = req.params.id;

  const deleteQuery = 'DELETE FROM services WHERE id = ?';
  db.query(deleteQuery, [service_id], (err, result) => {
    if (err) return res.status(500).json({ error: 'Failed to delete service' });
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Service not found' });
    }

    res.json({
      message: 'Service deleted successfully',
      service_id
    });
  });
});



module.exports = router;
