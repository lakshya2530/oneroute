const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const db = require('../db/connection');
const authenticate = require('../middleware/auth');

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
    const baseUrl = `${req.protocol}://${req.get('host')}/uploads`;
  
    const sql = `
      SELECT 
        o.id AS order_id, 
        o.order_number, 
        o.status, 
        o.order_date, 
        c.id AS customer_id, 
        c.full_name AS customer_name, 
        c.phone AS customer_mobile, 
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
              return JSON.parse(r.images || '[]').map(img => `${baseUrl}/products/${img}`);
            } catch (e) {
              return [];
            }
          })()
        }))
      };
  
      res.json(orderInfo);
    });
  });


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
  
  router.get('/vendor/product-requests', authenticate, (req, res) => {
  const vendor_id = req.user.id;

  const sql = `
    SELECT prs.id AS request_set_id, prs.request_title, prs.request_description,
           prs.min_price, prs.max_price, prs.estimated_delivery_days,
           prs.category_id, prs.subcategory_id,
           pr.id AS product_id, pr.product_title, pr.product_description, pr.images,
           IF(pb.id IS NOT NULL, 1, 0) AS already_bid
    FROM product_request_sets prs
    JOIN product_request_items pr ON prs.id = pr.request_set_id
    JOIN users v ON v.id = ?
    LEFT JOIN product_bids pb 
           ON pb.request_set_id = prs.id AND pb.vendor_id = v.id
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
          already_bid: !!row.already_bid,
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
    SELECT pb.id AS bid_id, pb.price, pb.description, pb.delivery_time_days, pb.additional_requirements,
           prs.id AS request_set_id, prs.request_title, prs.request_description,
           prs.min_price, prs.max_price, prs.estimated_delivery_days,
           prs.category_id, prs.subcategory_id,
           pr.id AS product_id, pr.product_title, pr.product_description, pr.images
    FROM product_bids pb
    JOIN product_request_sets prs ON pb.request_set_id = prs.id
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
          delivery_time: row.delivery_time,
          additional_requirements: row.additional_requirements,
          request_set_id: row.request_set_id,
          request_title: row.request_title,
          request_description: row.request_description,
          min_price: row.min_price,
          max_price: row.max_price,
          estimated_delivery_days: row.estimated_delivery_days,
          category_id: row.category_id,
          subcategory_id: row.subcategory_id,
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
