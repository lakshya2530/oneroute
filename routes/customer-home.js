const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const authenticate = require('../middleware/auth');

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
  
          // Parse JSON fields if they exist
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
  
  
      // db.query(productSql, [shop.vendor_id], (err2, productResults) => {
      //   if (err2) return res.status(500).json({ error: err2.message });
  
      //   // Format product images
      //   const formattedProducts = productResults.map(p => ({
      //     ...p,
      //     product_image: p.product_image ? `${baseUrl}/products/${p.product_image}` : ''
      //   }));
  
        // Step 3: Final response
        res.json({
          shop_details: shop,
          products: formattedProducts
        });
      });
    });
  });
  

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
       WHERE c.customer_id = ?`, [customer_id],
      (err, cartItems) => {
        if (err) return res.status(500).json({ error: err.message });
        if (cartItems.length === 0) return res.status(400).json({ error: 'Cart is empty' });
  
        const order_number = 'ORD' + Date.now();
        const firstItem = cartItems[0];
        const orderData = {
          order_number,
          customer_id,
          status: 'placed',
          order_date: new Date(),
          product_id: firstItem.product_id,  // new field
          vendor_id: firstItem.vendor_id 
        };
  
        db.query('INSERT INTO orders SET ?', orderData, (err, result) => {
          if (err) return res.status(500).json({ error: err.message });
  
          const order_id = result.insertId;
  
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
            (err) => {
              if (err) return res.status(500).json({ error: err.message });
  
              db.query('DELETE FROM cart WHERE customer_id = ?', [customer_id]);
              res.json({ message: 'Order placed', order_number, total_items: cartItems.length });
            }
          );
        });
      }
    );
  });
  

  router.get('/customer-orders', authenticate, (req, res) => {
    const customer_id = req.user.id;
    const now = new Date();
    const baseUrl = `${req.protocol}://${req.get('host')}/uploads`;

    const sql = `
      SELECT 
        o.order_number,o.status as order_status,o.order_date,o.product_id,o.customer_id,o.vendor_id,o.assigned_to
        p.name AS product_name, 
        p.images, 
        p.category,
        u.full_name AS vendor_name
      FROM orders o
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
                img => `${baseUrl}/${img}`
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
    products // array of {product_title, product_description, images[]}
  } = req.body;

  db.query(
    `INSERT INTO product_request_sets (customer_id, request_title, request_description, min_price, max_price,category_id,subcategory_id, estimated_delivery_days) 
     VALUES (?, ?, ? ,?, ?, ?, ?, ?)`,
    [customer_id, request_title, request_description, min_price, max_price,category_id,subcategory_id, estimated_delivery_days],
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
              images: (() => { try { return JSON.parse(i.images || "[]") } catch { return [] } })()
            }))
        }));

        res.json(grouped);
      }
    );
  });
});

module.exports = router;
