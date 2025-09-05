const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const authenticate = require('../middleware/auth');
const razorpay = require("../config/razorpay"); // import config
const crypto = require("crypto");

router.get('/customer/home', async (req, res) => {
  try {
    const baseUrl = `${req.protocol}://${req.get('host')}/uploads`;

    // 1. Get all categories with image
    const categories = await new Promise((resolve, reject) => {
      db.query('SELECT id, name, image FROM categories ORDER BY id DESC', (err, results) => {
        if (err) return reject(err);
        const formatted = results.map(c => ({
          ...c,
          image: c.image ? `${baseUrl}/categories/${c.image}` : ''
        }));
        resolve(formatted);
      });
    });

    // 2. Get vendor banners (ads)
    const vendorBanners = await new Promise((resolve, reject) => {
      db.query('SELECT image, image_link FROM vendor_ads ORDER BY id DESC LIMIT 10', (err, results) => {
        if (err) return reject(err);
        const formatted = results.map(ad => ({
          image: ad.image ? `${baseUrl}/vendor_ads/${ad.image}` : '',
          image_link: ad.image_link
        }));
        resolve(formatted);
      });
    });

    // 3. Get popular/latest products
    const products = await new Promise((resolve, reject) => {
      db.query('SELECT * FROM products WHERE status = "active" ORDER BY id DESC LIMIT 10', (err, results) => {
        if (err) return reject(err);
        const formatted = results.map(p => ({
          ...p,
          images: JSON.parse(p.images || '[]').map(img => `${baseUrl}/products/${img}`),
          specifications: (() => {
            try {
              return JSON.parse(p.specifications || '[]');
            } catch (e) {
              return [];
            }
          })()
        }));
        resolve(formatted);
      });
    });

    // 4. Get vendor shop list
    const shops = await new Promise((resolve, reject) => {
      db.query('SELECT id, vendor_id, shop_name, shop_image, address, gst_number, pan_number, owner_name, shop_document, additional_document FROM vendor_shops ORDER BY id DESC', (err, results) => {
        if (err) return reject(err);
        const formatted = results.map(s => ({
          ...s,
          shop_image:s.shop_image ? `${baseUrl}/shops/${s.shop_image}` : '',
          shop_document: s.shop_document ? `${baseUrl}/vendor_shops/${s.shop_document}` : '',
          additional_document: s.additional_document ? `${baseUrl}/vendor_shops/${s.additional_document}` : ''
        }));
        resolve(formatted);
      });
    });

    res.json({
      categories,
      vendor_banners: vendorBanners,
      popular_products: products,
      shops
    });
  } catch (error) {
    console.error('Home page error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/customer/shops', (req, res) => {
    const baseUrl = `${req.protocol}://${req.get('host')}/uploads`;
  
    const sql = `SELECT * FROM vendor_shops ORDER BY id DESC`;
    db.query(sql, (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
  
      const formatted = results.map(shop => ({
        ...shop,
        shop_image:shop.shop_image ? `${baseUrl}/shops/${shop.shop_image}` : '',
        shop_document: shop.shop_document ? `${baseUrl}/vendor_shops/${shop.shop_document}` : '',
        additional_document: shop.additional_document ? `${baseUrl}/vendor_shops/${shop.additional_document}` : ''
      }));
  
      res.json(formatted);
    });
  });

  router.get('/customer/shop-details/:shop_id', (req, res) => {
    const { shop_id } = req.params;
    const baseUrl = `${req.protocol}://${req.get('host')}/uploads`;
  
    // Step 1: Get shop details
    const shopSql = `
      SELECT 
        vs.*,
        u.full_name AS vendor_name,
        u.email AS vendor_email,
        u.phone AS vendor_phone
      FROM vendor_shops vs
      JOIN users u ON vs.vendor_id = u.id
      WHERE vs.id = ?
    `;
  
    db.query(shopSql, [shop_id], (err, shopResults) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!shopResults.length) return res.status(404).json({ error: 'Shop not found' });
  
      const shop = shopResults[0];
  
      // Format shop images
      shop.shop_image = shop.shop_image ? `${baseUrl}/shops/${shop.shop_image}` : '';
      shop.shop_document = shop.shop_document ? `${baseUrl}/vendor_shops/${shop.shop_document}` : '';
      shop.additional_document = shop.additional_document ? `${baseUrl}/vendor_shops/${shop.additional_document}` : '';
  
      // Step 2: Get all products for this vendor
      const productSql = `
        SELECT 
          p.*,
          c.name AS category_name,
          sc.name AS subcategory_name
        FROM products p
        LEFT JOIN categories c ON p.category = c.id
        LEFT JOIN categories sc ON p.sub_category = sc.id
        WHERE p.vendor_id = ?
        ORDER BY p.id DESC
      `;
      db.query(productSql, [shop.vendor_id], (err2, productResults) => {
        if (err2) return res.status(500).json({ error: err2.message });
  
        const formattedProducts = productResults.map(p => {
          let images = [];
          let specifications = [];
  
          try {
            if (p.images) {
              const parsedImages = JSON.parse(p.images);
              images = parsedImages.map(img => `${baseUrl}/products/${img}`);
            }
          } catch (e) {
            images = [];
          }
  
          try {
            if (p.specifications) {
              specifications = JSON.parse(p.specifications);
            }
          } catch (e) {
            specifications = [];
          }
  
          return {
            ...p,
            images,
            specifications
          };
        });
  
        // Step 3: Get all services for this vendor
        const serviceSql = `
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
          WHERE s.vendor_id = ?
          ORDER BY s.id DESC
        `;
        db.query(serviceSql, [shop.vendor_id], (err3, serviceResults) => {
          if (err3) return res.status(500).json({ error: err3.message });
  
          // Step 4: Fetch slots for each service
          const serviceIds = serviceResults.map(s => s.service_id);
          if (serviceIds.length === 0) {
            return res.json({
              shop_details: shop,
              products: formattedProducts,
              services: []
            });
          }
  
          const slotSql = `
            SELECT id, service_id, slot_date, slot_time
            FROM service_slots
            WHERE service_id IN (?)
            ORDER BY slot_date ASC, slot_time ASC
          `;
          db.query(slotSql, [serviceIds], (err4, slotResults) => {
            if (err4) return res.status(500).json({ error: err4.message });
  
            // Group slots by service_id
            const slotsByService = {};
            slotResults.forEach(slot => {
              if (!slotsByService[slot.service_id]) {
                slotsByService[slot.service_id] = [];
              }
              slotsByService[slot.service_id].push({
                slot_id: slot.id,
                slot_date: slot.slot_date,
                slot_time: slot.slot_time
              });
            });
  
            const formattedServices = serviceResults.map(s => ({
              ...s,
              subcategory_image: s.subcategory_image
                ? `${baseUrl}/${s.subcategory_image}`
                : '',
              slots: slotsByService[s.service_id] || []
            }));
  
            // Step 5: Final response
            res.json({
              shop_details: shop,
              products: formattedProducts,
              services: formattedServices
            });
          });
        });
      });
    });
  });
  

  // router.get('/customer/shop-details/:shop_id', (req, res) => {
  //   const { shop_id } = req.params;
  //   const baseUrl = `${req.protocol}://${req.get('host')}/uploads`;
  
  //   // Step 1: Get shop details
  //   const shopSql = `
  //     SELECT 
  //       vs.*,
  //       u.full_name AS vendor_name,
  //       u.email AS vendor_email,
  //       u.phone AS vendor_phone
  //     FROM vendor_shops vs
  //     JOIN users u ON vs.vendor_id = u.id
  //     WHERE vs.id = ?
  //   `;
  
  //   db.query(shopSql, [shop_id], (err, shopResults) => {
  //     if (err) return res.status(500).json({ error: err.message });
  //     if (!shopResults.length) return res.status(404).json({ error: 'Shop not found' });
  
  //     const shop = shopResults[0];
  
  //     // Format shop images
  //     shop.shop_image = shop.shop_image ? `${baseUrl}/shops/${shop.shop_image}` : '';
  //     shop.shop_document = shop.shop_document ? `${baseUrl}/vendor_shops/${shop.shop_document}` : '';
  //     shop.additional_document = shop.additional_document ? `${baseUrl}/vendor_shops/${shop.additional_document}` : '';
  
  //     // Step 2: Get all products for this vendor
  //     const productSql = `
  //       SELECT 
  //         p.*,
  //         c.name AS category_name,
  //         sc.name AS subcategory_name
  //       FROM products p
  //       LEFT JOIN categories c ON p.category = c.id
  //       LEFT JOIN categories sc ON p.sub_category = sc.id
  //       WHERE p.vendor_id = ?
  //       ORDER BY p.id DESC
  //     `;
  //     db.query(productSql, [shop.vendor_id], (err2, productResults) => {
  //       if (err2) return res.status(500).json({ error: err2.message });
  
  //       const formattedProducts = productResults.map(p => {
  //         let images = [];
  //         let specifications = [];
  
  //         // Parse JSON fields if they exist
  //         try {
  //           if (p.images) {
  //             const parsedImages = JSON.parse(p.images);
  //             images = parsedImages.map(img => `${baseUrl}/products/${img}`);
  //           }
  //         } catch (e) {
  //           images = [];
  //         }
  
  //         try {
  //           if (p.specifications) {
  //             specifications = JSON.parse(p.specifications);
  //           }
  //         } catch (e) {
  //           specifications = [];
  //         }
  
  //         return {
  //           ...p,
  //           images,
  //           specifications
  //         };
  //       });
  
  
  //     // db.query(productSql, [shop.vendor_id], (err2, productResults) => {
  //     //   if (err2) return res.status(500).json({ error: err2.message });
  
  //     //   // Format product images
  //     //   const formattedProducts = productResults.map(p => ({
  //     //     ...p,
  //     //     product_image: p.product_image ? `${baseUrl}/products/${p.product_image}` : ''
  //     //   }));
  
  //       // Step 3: Final response
  //       res.json({
  //         shop_details: shop,
  //         products: formattedProducts
  //       });
  //     });
  //   });
  // });
  

  router.get('/customer/products', (req, res) => {
    const { category, sub_category } = req.query;
    const baseUrl = `${req.protocol}://${req.get('host')}/uploads`;
  
    let sql = 'SELECT * FROM products WHERE status = "active"';
    const values = [];
  
    if (category) {
      sql += ' AND category = ?';
      values.push(category);
    }
  
    if (sub_category) {
      sql += ' AND sub_category = ?';
      values.push(sub_category);
    }
  
    sql += ' ORDER BY id DESC';
  
    db.query(sql, values, (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
  
      const formatted = results.map(p => ({
        ...p,
        images: JSON.parse(p.images || '[]').map(img => `${baseUrl}/products/${img}`),
        specifications: (() => {
          try {
            return JSON.parse(p.specifications || '[]');
          } catch (e) {
            return [];
          }
        })()
      }));
  
      res.json(formatted);
    });
  });
  
  router.get('/customer/product/:id', (req, res) => {
    const { id } = req.params;
    const baseUrl = `${req.protocol}://${req.get('host')}/uploads`;
  
    const sql = `
      SELECT 
        p.*,
        c.name AS category_name,
        sc.name AS subcategory_name,
        vs.id AS shop_id,
        vs.shop_name,
        vs.shop_image,
        vs.address,
        vs.city,
        vs.state,
        vs.pincode,
        u.full_name AS vendor_name,
        u.phone AS vendor_phone
      FROM products p
      LEFT JOIN categories c ON p.category = c.id
      LEFT JOIN categories sc ON p.sub_category = sc.id
      LEFT JOIN vendor_shops vs ON p.vendor_id = vs.vendor_id
      LEFT JOIN users u ON p.vendor_id = u.id
      WHERE p.id = ?
    `;
  
    db.query(sql, [id], (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!results.length) return res.status(404).json({ error: 'Product not found' });
  
      const p = results[0];
  
      let images = [];
      let specifications = [];
  
      try {
        images = JSON.parse(p.images || '[]').map(img => `${baseUrl}/products/${img}`);
      } catch (e) {
        images = [];
      }
  
      try {
        specifications = JSON.parse(p.specifications || '[]');
      } catch (e) {
        specifications = [];
      }
  
      const productDetail = {
        ...p,
        images,
        specifications,
        shop_image: p.shop_image ? `${baseUrl}/shops/${p.shop_image}` : ''
      };
  
      res.json(productDetail);
    });
  });
  
  
  router.post('/cart/add', authenticate, (req, res) => {
    const customer_id = req.user.id;
    const { product_id, quantity } = req.body;
  
    const sql = `INSERT INTO cart (customer_id, product_id, quantity) VALUES (?, ?, ?) 
                 ON DUPLICATE KEY UPDATE quantity = quantity + ?`;
  
    db.query(sql, [customer_id, product_id, quantity, quantity], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Product added/updated in cart' });
    });
  });
  

  router.patch('/cart/update', authenticate, (req, res) => {
    const customer_id = req.user.id;
    const { product_id, quantity } = req.body;
  
    const sql = `UPDATE cart SET quantity = ? WHERE customer_id = ? AND product_id = ?`;
    db.query(sql, [quantity, customer_id, product_id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Cart updated' });
    });
  });

  router.get('/cart/list', authenticate, (req, res) => {
    const customer_id = req.user.id;
    const baseUrl = `${req.protocol}://${req.get('host')}/uploads`;
  
    const sql = `
      SELECT 
        c.id AS cart_id, 
        c.quantity, 
        p.id AS product_id, 
        p.name, 
        p.selling_price, 
        p.images,
        vs.shop_name
      FROM cart c
      JOIN products p ON c.product_id = p.id
      LEFT JOIN vendor_shops vs ON p.vendor_id = vs.vendor_id
      WHERE c.customer_id = ?
    `;
  
    db.query(sql, [customer_id], (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
  
      let totalAmount = 0;
  
      const cart = results.map(item => {
        const images = (() => {
          try {
            return JSON.parse(item.images || '[]').map(img => `${baseUrl}/products/${img}`);
          } catch {
            return [];
          }
        })();
  
        const amount = item.selling_price * item.quantity;
        totalAmount += amount;
  
        return {
          cart_id: item.cart_id,
          product_id: item.product_id,
          name: item.name,
          quantity: item.quantity,
          selling_price: item.selling_price,
          amount,
          images,
          shop_name: item.shop_name || '',
        //  shop_description: item.shop_description || ''
        };
      });
  
      res.json({
        cart,
        total_amount: totalAmount
      });
    });
  });
  
  // router.get('/cart/list', authenticate, (req, res) => {
  //   const customer_id = req.user.id;
  //   const baseUrl = `${req.protocol}://${req.get('host')}/uploads`;
  
  //   const sql = `
  //     SELECT c.id as cart_id, c.quantity, p.id as product_id, p.name, p.selling_price, p.images
  //     FROM cart c
  //     JOIN products p ON c.product_id = p.id
  //     WHERE c.customer_id = ?
  //   `;
  
  //   db.query(sql, [customer_id], (err, results) => {
  //     if (err) return res.status(500).json({ error: err.message });
  
  //     let totalAmount = 0;
  
  //     const cart = results.map(item => {
  //       const images = JSON.parse(item.images || '[]').map(img => `${baseUrl}/products/${img}`);
  //       const amount = item.selling_price * item.quantity;
  //       totalAmount += amount;
  
  //       return {
  //         cart_id: item.cart_id,
  //         product_id: item.product_id,
  //         name: item.name,
  //         quantity: item.quantity,
  //         selling_price: item.selling_price,
  //         amount,
  //         images
  //       };
  //     });
  
  //     res.json({
  //       cart,
  //       total_amount: totalAmount
  //     });
  //   });
  // });

  router.delete('/cart/remove/:cart_id', authenticate, (req, res) => {
    const { cart_id } = req.params;
  
    db.query('DELETE FROM cart WHERE id = ?', [cart_id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Item removed from cart' });
    });
  });

  router.post('/place-order', authenticate, (req, res) => {
    const customer_id = req.user.id;
  
    db.query(
      `SELECT c.*, p.name, p.selling_price, p.vendor_id 
       FROM cart c 
       JOIN products p ON c.product_id = p.id 
       WHERE c.customer_id = ?`, 
      [customer_id],
      (err, cartItems) => {
        if (err) return res.status(500).json({ error: err.message });
        if (cartItems.length === 0) return res.status(400).json({ error: 'Cart is empty' });
  
        // Step 1: Calculate total
        const totalAmount = cartItems.reduce((sum, item) => sum + (item.selling_price * (item.quantity || 1)), 0);
  
        // Step 2: Create Razorpay order
        const options = {
          amount: totalAmount * 100, // paise
          currency: "INR",
          receipt: `order_${Date.now()}`
        };
  
        razorpay.orders.create(options, (err2, razorpayOrder) => {
          if (err2) return res.status(500).json({ error: 'Razorpay order creation failed', details: err2 });
  
          // Step 3: Insert into orders table (pending_payment)
          const order_number = 'ORD' + Date.now();
          const firstItem = cartItems[0];
  
          const orderData = {
            order_number,
            customer_id,
            status: 'pending_payment',   // 👈 not placed yet
            order_date: new Date(),
            product_id: firstItem.product_id,
            vendor_id: firstItem.vendor_id,
            razorpay_order_id: razorpayOrder.id,
            amount: totalAmount
          };
  
          db.query('INSERT INTO orders SET ?', orderData, (err3, result) => {
            if (err3) return res.status(500).json({ error: err3.message });
  
            const order_id = result.insertId;
  
            // Step 4: Insert order items
            const items = cartItems.map(item => ([
              order_id,
              item.product_id,
              item.vendor_id,
              item.quantity || 1,
              item.selling_price
            ]));
  
            db.query(
              `INSERT INTO order_items (order_id, product_id, vendor_id, quantity, price) VALUES ?`,
              [items],
              (err4) => {
                if (err4) return res.status(500).json({ error: err4.message });
  
                // Step 5: Insert transaction
                const txnSql = `
                  INSERT INTO transactions (order_id, customer_id, razorpay_order_id, amount, status, transaction_type)
                  VALUES (?, ?, ?, ?, 'pending','order')
                `;
                db.query(txnSql, [order_id, customer_id, razorpayOrder.id, totalAmount]);
  
                // Step 6: Clear cart
                db.query('DELETE FROM cart WHERE customer_id = ?', [customer_id]);
  
                // Step 7: Send response
                res.json({
                  status: true,
                  message: 'Razorpay order created. Proceed with payment.',
                  order_id,
                  order_number,
                  razorpay_order: razorpayOrder,
                  total_amount: totalAmount,
                  status_value: 'pending_payment'
                });
              }
            );
          });
        });
      }
    );
  });


  router.post("/verify-order-payment", authenticate, (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, order_id } = req.body;
    const customer_id = req.user.id;
  
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !order_id) {
      return res.status(400).json({ error: "All fields are required" });
    }
  
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest("hex");
  
    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ error: "Invalid payment signature" });
    }
  
    // Update order + transaction
    const updateOrder = `
      UPDATE orders 
      SET status = 'placed', razorpay_payment_id = ?, razorpay_signature = ?
      WHERE id = ? AND customer_id = ?
    `;
    db.query(updateOrder, [razorpay_payment_id, razorpay_signature, order_id, customer_id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
  
      const updateTxn = `
        UPDATE transactions 
        SET razorpay_payment_id = ?, razorpay_signature = ?, status = 'success'
        WHERE order_id = ? AND customer_id = ?
      `;
      db.query(updateTxn, [razorpay_payment_id, razorpay_signature, order_id, customer_id]);
  
      res.json({
        status: true,
        message: "Order payment verified successfully",
        order_id,
        razorpay_payment_id,
        status_value: "placed"
      });
    });
  });
  
  
  // router.post('/place-order', authenticate, (req, res) => {
  //   const customer_id = req.user.id;
  
  //   db.query(
  //     `SELECT c.*, p.name, p.selling_price, p.vendor_id 
  //      FROM cart c 
  //      JOIN products p ON c.product_id = p.id 
  //      WHERE c.customer_id = ?`, [customer_id],
  //     (err, cartItems) => {
  //       if (err) return res.status(500).json({ error: err.message });
  //       if (cartItems.length === 0) return res.status(400).json({ error: 'Cart is empty' });
  
  //       const order_number = 'ORD' + Date.now();
  //       const firstItem = cartItems[0];
  //       const orderData = {
  //         order_number,
  //         customer_id,
  //         status: 'placed',
  //         order_date: new Date(),
  //         product_id: firstItem.product_id,  // new field
  //         vendor_id: firstItem.vendor_id 
  //       };
  
  //       db.query('INSERT INTO orders SET ?', orderData, (err, result) => {
  //         if (err) return res.status(500).json({ error: err.message });
  
  //         const order_id = result.insertId;
  
  //         const items = cartItems.map(item => ([
  //           order_id,
  //           item.product_id,
  //           item.vendor_id,
  //           item.quantity || 1,
  //           item.selling_price
  //         ]));
  
  //         db.query(
  //           `INSERT INTO order_items (order_id, product_id, vendor_id, quantity, price) VALUES ?`,
  //           [items],
  //           (err) => {
  //             if (err) return res.status(500).json({ error: err.message });
  
  //             db.query('DELETE FROM cart WHERE customer_id = ?', [customer_id]);
  //             res.json({ message: 'Order placed', order_number, total_items: cartItems.length });
  //           }
  //         );
  //       });
  //     }
  //   );
  // });
  

  router.get('/customer-orders', authenticate, (req, res) => {
    const customer_id = req.user.id;
    const now = new Date();
    const baseUrl = `${req.protocol}://${req.get('host')}/uploads`;

    const sql = `
      SELECT 
        o.order_number,o.id as order_id,o.status as order_status,o.order_date,o.product_id,o.customer_id,o.vendor_id,o.assigned_to,ot.price,
        p.name AS product_name, 
        p.images, 
        p.category,
        u.full_name AS vendor_name
      FROM orders o
      JOIN order_items ot ON o.id = ot.order_id
      JOIN products p ON o.product_id = p.id
      JOIN users u ON o.vendor_id = u.id
      WHERE o.customer_id = ?
      ORDER BY o.order_date DESC
    `;
  
    db.query(sql, [customer_id], (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
  
      const upcoming = [];
      const past = [];
  
      results.forEach(order => {
       // order.delivery_date
        const deliveryDate = new Date(order.order_date || order.delivery_date);
        const images = (() => {
          try {
            return JSON.parse(order.images || '[]').map(
                img => `${baseUrl}/products/${img}`
             // img => `${process.env.BASE_URL || 'http://localhost:3000'}/uploads/${img}`
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
  
        if (deliveryDate > now) {
          upcoming.push(formattedOrder);
        } else {
          past.push(formattedOrder);
        }
      });
  
      res.json({ upcoming_orders: upcoming, past_orders: past });
    });
  });
  
  router.get('/customer-orders/:order_id', authenticate, (req, res) => {
    const customer_id = req.user.id;
    const { order_id } = req.params;
    const baseUrl = `${req.protocol}://${req.get('host')}/uploads`;
  
    const sql = `
      SELECT 
        o.order_number, o.id AS order_id, o.status AS order_status, 
        o.order_date, o.customer_id, o.vendor_id, o.assigned_to, 
        oi.price, oi.quantity,
        p.name AS product_name, p.description AS product_description,
        p.images, p.category, 
        u.full_name AS vendor_name, u.phone AS vendor_mobile
      FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      JOIN products p ON oi.product_id = p.id
      JOIN users u ON o.vendor_id = u.id
      WHERE o.id = ? AND o.customer_id = ?
    `;
  
    db.query(sql, [order_id, customer_id], (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!results.length) return res.status(404).json({ error: "Order not found" });
  
      // format images
      const orderItems = results.map(item => {
        const images = (() => {
          try {
            return JSON.parse(item.images || '[]').map(
              img => `${baseUrl}/products/${img}`
            );
          } catch {
            return [];
          }
        })();
  
        return {
          product_id: item.product_id,
          product_name: item.product_name,
          product_description: item.product_description,
          price: item.price,
          quantity: item.quantity,
          category: item.category,
          images
        };
      });
  
      // single order response
      const orderDetail = {
        order_id: results[0].order_id,
        order_number: results[0].order_number,
        status: results[0].order_status,
        order_date: results[0].order_date,
        vendor: {
          vendor_id: results[0].vendor_id,
          vendor_name: results[0].vendor_name,
          vendor_mobile: results[0].vendor_mobile
        },
        items: orderItems
      };
  
      res.json(orderDetail);
    });
  });
  

  // GET /categories
router.get('/home/categories', (req, res) => {
  db.query('SELECT * FROM categories WHERE parent_id IS NULL', (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    
    // Parse JSON labels
    const formatted = results.map(cat => ({
      ...cat,
      labels: (() => {
        try {
          return JSON.parse(cat.labels || '[]');
        } catch (e) {
          return [];
        }
      })()
    }));

    res.json(formatted);
  });
});

// GET /sub-categories/:parentId
router.get('/home/sub-categories/:parentId', (req, res) => {
  const { parentId } = req.params;

  db.query('SELECT * FROM categories WHERE parent_id = ?', [parentId], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });

    const formatted = results.map(cat => ({
      ...cat,
      labels: (() => {
        try {
          return JSON.parse(cat.labels || '[]');
        } catch (e) {
          return [];
        }
      })()
    }));

    res.json(formatted);
  });
});


router.post('/product-request-create', authenticate, (req, res) => {
  const customer_id = req.user.id;
  const {
    request_title,
    request_description,
    min_price,
    max_price,
    category_id,
    subcategory_id,
    type,
    estimated_delivery_days,
    bid_sub_price,
    products // array of {product_title, product_description, images[]}
  } = req.body;

  db.query(
    `INSERT INTO product_request_sets (customer_id, request_title, request_description, min_price, max_price,category_id,subcategory_id, estimated_delivery_days,bid_sub_price) 
     VALUES (?, ?, ? ,?, ?, ?, ?, ?, ?)`,
    [customer_id, request_title, request_description, min_price, max_price,category_id,subcategory_id, estimated_delivery_days,bid_sub_price],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      const request_set_id = result.insertId;

      if (products && products.length > 0) {
        const items = products.map(p => [
          request_set_id,
          p.product_title,
          p.product_description,
          JSON.stringify(p.images || [])
        ]);
        db.query(
          `INSERT INTO product_request_items (request_set_id, product_title, product_description, images) VALUES ?`,
          [items]
        );
      }

      res.json({ message: "Product request set created", request_set_id });
    }
  );
});

router.get('/product-request-set/:id/bids', authenticate, (req, res) => {
  const { id: request_set_id } = req.params;

  db.query(
    `SELECT pb.*, u.full_name AS vendor_name 
     FROM product_bids pb
     JOIN users u ON pb.vendor_id = u.id
     WHERE pb.request_set_id = ? 
     ORDER BY pb.price ASC`,
    [request_set_id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});


router.post('/product-request-set/:id/bid/:bid_id/status', authenticate, (req, res) => {
  const { id: request_set_id, bid_id } = req.params;
  const { status } = req.body; // accepted or rejected

  if (!['accepted', 'rejected'].includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  db.query(`UPDATE product_bids SET status = ? WHERE id = ? AND request_set_id = ?`,
    [status, bid_id, request_set_id],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });

      if (status === "accepted") {
        db.query(`UPDATE product_request_sets SET status = 'in_progress' WHERE id = ?`, [request_set_id]);
      }

      res.json({ message: `Bid ${status}` });
    });
});


router.get('/my-product-request-sets', authenticate, (req, res) => {
  const customer_id = req.user.id;

  const sql = `
    SELECT prs.*, 
      (SELECT COUNT(*) FROM product_bids pb WHERE pb.request_set_id = prs.id) AS total_bids
    FROM product_request_sets prs
    WHERE prs.customer_id = ?
    ORDER BY prs.created_at DESC
  `;

  db.query(sql, [customer_id], (err, sets) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!sets.length) return res.json([]);

    const setIds = sets.map(s => s.id);

    db.query(
      `SELECT * FROM product_request_items WHERE request_set_id IN (?)`,
      [setIds],
      (err, items) => {
        if (err) return res.status(500).json({ error: err.message });

        const grouped = sets.map(set => ({
          ...set,
          products: items
            .filter(i => i.request_set_id === set.id)
            .map(i => ({
              ...i,
              images: (() => {
                try {
                  if (!i.images) return [];
                  let imgs = i.images;

                  // Convert Buffer → string
                  if (Buffer.isBuffer(imgs)) imgs = imgs.toString();

                  // If string, parse JSON
                  if (typeof imgs === "string") {
                    imgs = JSON.parse(imgs);
                  }

                  // Ensure it's an array
                  return Array.isArray(imgs) ? imgs : [];
                } catch (e) {
                  console.error("Image parse error:", e, i.images);
                  return [];
                }
              })()
            }))
        }));

        res.json(grouped);
      }
    );
  });
});

// router.post('/book-service', authenticate, (req, res) => {
//   const { service_id, slot_ids, address_id } = req.body;
//   const customer_id = req.user.id;

//   if (!service_id || !slot_ids || !Array.isArray(slot_ids) || slot_ids.length === 0 || !address_id) {
//     return res.status(400).json({ error: 'Service ID, slot IDs array, and address ID are required' });
//   }

//   // Step 1: Verify service exists
//   const serviceCheck = `SELECT id FROM services WHERE id = ?`;
//   db.query(serviceCheck, [service_id], (err, serviceResults) => {
//     if (err) return res.status(500).json({ error: err.message });
//     if (serviceResults.length === 0) {
//       return res.status(404).json({ error: 'Service not found' });
//     }

//     // Step 2: Check if slots are already booked
//     const bookingCheck = `
//       SELECT * FROM bookings 
//       WHERE JSON_OVERLAPS(slot_id, CAST(? AS JSON))
//         AND service_id = ?
//         AND status != "cancelled"
//     `;
//     db.query(bookingCheck, [JSON.stringify(slot_ids), service_id], (err2, booked) => {
//       if (err2) return res.status(500).json({ error: err2.message });
//       if (booked.length > 0) {
//         return res.status(400).json({ error: 'One or more slots already booked' });
//       }

//       // Step 3: Insert one booking row
//       const insertBooking = `
//         INSERT INTO bookings (customer_id, service_id, slot_id, address_id, status)
//         VALUES (?, ?, CAST(? AS JSON), ?, 'pending')
//       `;
//       db.query(insertBooking, [customer_id, service_id, JSON.stringify(slot_ids), address_id], (err3, result) => {
//         if (err3) return res.status(500).json({ error: err3.message });

//         res.json({
//           status: true,
//           message: 'Service booked successfully',
//           booking_id: result.insertId,
//           slot_ids,
//           status_value: 'pending'
//         });
//       });
//     });
//   });
// });


router.post("/book-service", authenticate, async (req, res) => {
  try {
    const { service_id, slot_ids, address_id } = req.body;
    const customer_id = req.user.id;

    if (!service_id || !slot_ids || !Array.isArray(slot_ids) || slot_ids.length === 0 || !address_id) {
      return res.status(400).json({ error: "Service ID, slot IDs array, and address ID are required" });
    }

    // Step 1: Verify service exists
    const serviceCheck = `SELECT id, price FROM services WHERE id = ?`;
    const [serviceResults] = await db.promise().query(serviceCheck, [service_id]);
    if (serviceResults.length === 0) {
      return res.status(404).json({ error: "Service not found" });
    }

    const servicePrice = serviceResults[0].price * slot_ids.length;

    // Step 2: Create Razorpay order
    const options = {
      amount: servicePrice * 100, // in paise
      currency: "INR",
      receipt: `receipt_${Date.now()}`
    };

    const order = await razorpay.orders.create(options); // ✅ async/await call

    // Step 3: Insert booking
    const insertBooking = `
      INSERT INTO bookings (customer_id, service_id, slot_id, address_id, status, razorpay_order_id, amount)
      VALUES (?, ?, CAST(? AS JSON), ?, 'pending_payment', ?, ?)
    `;
    const [bookingResult] = await db.promise().query(insertBooking, [
      customer_id,
      service_id,
      JSON.stringify(slot_ids),
      address_id,
      order.id,
      servicePrice
    ]);

    const booking_id = bookingResult.insertId;

    // Step 4: Insert transaction entry
    const insertTxn = `
      INSERT INTO transactions (booking_id, customer_id, razorpay_order_id, amount, status,transaction_type)
      VALUES (?, ?, ?, ?, 'pending','service')
    `;
    await db.promise().query(insertTxn, [booking_id, customer_id, order.id, servicePrice]);

    res.json({
      status: true,
      message: "Razorpay order created. Proceed with payment.",
      booking_id,
      razorpay_order: order,
      amount: servicePrice,
      slot_ids,
      status_value: "pending_payment"
    });

  } catch (err) {
    console.error("Book Service Error:", err);
    res.status(500).json({ error: err.message || err });
  }
});

router.post('/service/verify-payment', authenticate, (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, booking_id } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !booking_id) {
    return res.status(400).json({ error: "All fields are required" });
  }

  const key_secret = process.env.RAZORPAY_KEY_SECRET;

  // Step 1: Generate expected signature
  const generated_signature = crypto
    .createHmac("sha256", key_secret)
    .update(razorpay_order_id + "|" + razorpay_payment_id)
    .digest("hex");

  if (generated_signature === razorpay_signature) {
    // ✅ Payment verified → update booking + transaction
    const updateBooking = `
      UPDATE bookings
      SET status = 'confirmed',
          razorpay_payment_id = ?
      WHERE id = ?
    `;
    db.query(updateBooking, [razorpay_payment_id, booking_id], (err, result) => {
      if (err) return res.status(500).json({ error: err.message });

      const updateTxn = `
        UPDATE transactions
        SET razorpay_payment_id = ?, razorpay_signature = ?, status = 'success'
        WHERE booking_id = ?
      `;
      db.query(updateTxn, [razorpay_payment_id, razorpay_signature, booking_id]);

      res.json({
        status: true,
        message: "Payment verified and booking confirmed"
      });
    });
  } else {
    // ❌ Invalid payment
    const failTxn = `
      UPDATE transactions
      SET razorpay_payment_id = ?, razorpay_signature = ?, status = 'failed'
      WHERE booking_id = ?
    `;
    db.query(failTxn, [razorpay_payment_id, razorpay_signature, booking_id]);

    res.status(400).json({ error: "Invalid payment signature" });
  }
});


router.get('/customer/transactions', authenticate, (req, res) => {
  const customer_id = req.user.id;

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
    WHERE t.customer_id = ?
    ORDER BY t.id DESC
  `;

  db.query(sql, [customer_id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({
      status: true,
      message: 'Customer transactions fetched successfully',
      data: results
    });
  });
});



router.get('/customer/bookings', authenticate, (req, res) => {
  const customer_id = req.user.id;
  const baseUrl = `${req.protocol}://${req.get('host')}/uploads`;

  const sql = `
    SELECT 
      b.id AS booking_id,
      b.status,
      b.created_at,
      b.slot_id, -- JSON or stringified array
      s.service_name,
      s.service_description,
      s.price,
      s.service_type,
      s.location,
      s.meet_link,
      ca.name AS address_name,
      ca.description AS address
    FROM bookings b
    JOIN services s ON b.service_id = s.id
    JOIN customer_addresses ca ON b.address_id = ca.id
    WHERE b.customer_id = ?
    ORDER BY b.id DESC
  `;

  db.query(sql, [customer_id], async (err, bookings) => {
    if (err) return res.status(500).json({ error: err.message });

    if (!bookings.length) {
      return res.json({
        status: true,
        message: 'No bookings found',
        data: []
      });
    }

    // Process each booking and fetch slots
    const promises = bookings.map(booking => {
      return new Promise((resolve, reject) => {
        let slotIds = [];

        // Ensure slot_id is parsed properly
        try {
          if (typeof booking.slot_id === 'string') {
            slotIds = JSON.parse(booking.slot_id); // string -> array
          } else {
            slotIds = booking.slot_id; // already JSON type
          }

          // Make sure it’s an array of integers
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

          booking.slots = slotResults; // attach array of slots
          delete booking.slot_id; // don’t expose raw JSON
          resolve(booking);
        });
      });
    });

    Promise.all(promises)
      .then(data => {
        res.json({
          status: true,
          message: 'Customer bookings fetched successfully',
          data
        });
      })
      .catch(err3 => {
        res.status(500).json({ error: err3.message });
      });
  });
});



router.post('/add-address', authenticate, (req, res) => {
  const { name, description } = req.body;
  const customer_id = req.user.id;

  if (!name || !description) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  const sql = `
    INSERT INTO customer_addresses (customer_id, name, description)
    VALUES (?, ?, ?)
  `;
  db.query(sql, [customer_id, name, description], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });

    res.json({
      status: true,
      message: 'Address added successfully',
      address_id: result.insertId
    });
  });
});



router.get('/list-addresses', authenticate, (req, res) => {
  const customer_id = req.user.id;

  const sql = `
    SELECT id, name, description, created_at 
    FROM customer_addresses 
    WHERE customer_id = ? 
    ORDER BY id DESC
  `;
  db.query(sql, [customer_id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });

    res.json({
      status: true,
      message: 'Addresses fetched successfully',
      data: results
    });
  });
});


router.post('/bids/:bid_id/chat', authenticate, (req, res) => {
  const sender_id = req.user.id;
  const { bid_id } = req.params;
  const { receiver_id, message } = req.body;

  if (!message || !receiver_id) {
    return res.status(400).json({ error: "Message and receiver_id required" });
  }

  const sql = `INSERT INTO chat_messages (bid_id, sender_id, receiver_id, message) 
               VALUES (?, ?, ?, ?)`;
  db.query(sql, [bid_id, sender_id, receiver_id, message], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });

    res.json({
      chat_id: result.insertId,
      bid_id,
      sender_id,
      receiver_id,
      message,
      created_at: new Date()
    });
  });
});


router.get('/bids/:bid_id/chat', authenticate, (req, res) => {
  const { bid_id } = req.params;

  const sql = `
    SELECT cm.*, u.full_name AS sender_name
    FROM chat_messages cm
    JOIN users u ON cm.sender_id = u.id
    WHERE cm.bid_id = ?
    ORDER BY cm.created_at ASC
  `;

  db.query(sql, [bid_id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });

    res.json(results);
  });
});


router.get('/my-chats', authenticate, (req, res) => {
  const user_id = req.user.id;

  const sql = `
    SELECT cm.bid_id, prs.request_title, pb.vendor_id, pb.id AS bid_id,
           (SELECT message FROM chat_messages 
            WHERE bid_id = cm.bid_id ORDER BY created_at DESC LIMIT 1) AS last_message,
           (SELECT created_at FROM chat_messages 
            WHERE bid_id = cm.bid_id ORDER BY created_at DESC LIMIT 1) AS last_time
    FROM chat_messages cm
    JOIN product_bids pb ON cm.bid_id = pb.id
    JOIN product_request_sets prs ON pb.request_set_id = prs.id
    WHERE cm.sender_id = ? OR cm.receiver_id = ?
    GROUP BY cm.bid_id
    ORDER BY last_time DESC
  `;

  db.query(sql, [user_id, user_id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });

    res.json(results);
  });
});







module.exports = router;
