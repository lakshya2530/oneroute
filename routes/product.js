const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db/connection'); // adjust path if needed

// Multer storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = 'uploads/products';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({ storage, limits: { files: 5 } });

// Create Product
router.post('/product-create', upload.array('images', 5), (req, res) => {
  const { name, description, actual_price,selling_price, category, specifications, status = 'active' } = req.body;
  const images = req.files.map(file => file.filename);
  let parsedSpecifications = [];
  parsedSpecifications = typeof specifications === 'string'
      ? JSON.parse(specifications)
      : specifications;
  const product = {
    name,
    description,
    actual_price,
    selling_price,
    category,
    images: JSON.stringify(images),
    specifications: JSON.stringify(parsedSpecifications), // save as JSON string
    status
  };

  db.query('INSERT INTO products SET ?', product, (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Product created', id: result.insertId });
  });
});

router.post('/bulk-product-create', upload.array('images'), (req, res) => {
  const files = req.files;
  const products = JSON.parse(req.body.products);

  // Prepare data
  const values = products.map(product => {
    const productImages = product.image_keys.map(filename => {
      const match = files.find(file => file.originalname === filename);
      return match ? match.filename : null;
    }).filter(Boolean); // remove any nulls

    return [
      product.name,
      product.description,
      product.actual_price,
      product.selling_price,
      product.category,
      JSON.stringify(productImages), // store image list as JSON
      product.status || 'active'
    ];
  });

  const sql = `INSERT INTO products (name, description, actual_price, selling_price, category, images, status) VALUES ?`;

  db.query(sql, [values], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Bulk products uploaded with images', inserted: result.affectedRows });
  });
});




router.get('/product-list', (req, res) => {
    db.query('SELECT * FROM products ORDER BY id DESC', (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
         // Parse the images string field back to an array
    const formattedResults = results.map(product => ({
      ...product,
      images: JSON.parse(product.images || '[]'),
      specifications: JSON.parse(product.specifications || '[]')

    }));
      res.json(formattedResults);
    });
  });

  
  router.put('/product-update/:id', upload.array('images', 5), (req, res) => {
    const { id } = req.params;
    const { name, description, actual_price, selling_price, category,specifications, status } = req.body;
    let updatedData = { name, description, actual_price, selling_price, category, status };
  
    if (req.files && req.files.length > 0) {
      const images = req.files.map(file => file.filename);
      updatedData.images = JSON.stringify(images);
    }
    if (specifications) {
      try {
        updatedData.specifications = JSON.stringify(JSON.parse(specifications));
      } catch (e) {
        return res.status(400).json({ error: 'Invalid specifications format' });
      }
    }
    db.query('UPDATE products SET ? WHERE id = ?', [updatedData, id], (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Product updated' });
    });
  });

  
  router.delete('/product-delete/:id', (req, res) => {
    const { id } = req.params;
    db.query('DELETE FROM products WHERE id = ?', [id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Product deleted' });
    });
  });

  
  router.patch('/product-status/:id', (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    db.query('UPDATE products SET status = ? WHERE id = ?', [status, id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Status updated' });
    });
  });

  router.post('/category-create', (req, res) => {
    const { name } = req.body;
  
    const product = {
      name
    };
  
    db.query('INSERT INTO categories SET ?', product, (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Category created', id: result.insertId });
    });
  });
  
  router.get('/category-list', (req, res) => {
    db.query('SELECT * FROM categories ORDER BY id DESC', (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
         // Parse the images string field back to an array
    const formattedResults = results.map(product => ({
      ...product
    }));
      res.json(formattedResults);
    });
  });

  
  router.put('/category-update/:id', (req, res) => {
    const { id } = req.params;
    const { name } = req.body;
    let updatedData = { name };
  
 
  
    db.query('UPDATE categories SET ? WHERE id = ?', [updatedData, id], (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Category updated' });
    });
  });

  
  router.delete('/category-delete/:id', (req, res) => {
    const { id } = req.params;
    db.query('DELETE FROM categories WHERE id = ?', [id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Category deleted' });
    });
  });


  router.get('/orders-list', (req, res) => {
    db.query('SELECT * FROM orders ORDER BY id DESC', (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(results);
    });
  });

  //  router.get('/tickets-list', (req, res) => {
  //   db.query('SELECT * FROM tickets ORDER BY id DESC', (err, results) => {
  //     if (err) return res.status(500).json({ error: err.message });
  //     res.json(results);
  //   });
  // });

  router.get('/tickets-list', (req, res) => {
    const sql = `
      SELECT t.*, 
        (SELECT JSON_ARRAYAGG(JSON_OBJECT('id', r.id, 'message', r.message, 'created_at', r.created_at))
         FROM ticket_replies r 
         WHERE r.ticket_id = t.id) AS replies
      FROM tickets t
      ORDER BY t.id DESC
    `;
  
    db.query(sql, (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
  
      // Parse JSON replies string to object
      const formatted = results.map(t => ({
        ...t,
        replies: JSON.parse(t.replies || '[]')
      }));
  
      res.json(formatted);
    });
  });

  
  router.post('/tickets/:id/reply', (req, res) => {
    const ticketId = req.params.id;
    const { message } = req.body;
  
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
  
    const sql = 'INSERT INTO ticket_replies (ticket_id, message) VALUES (?, ?)';
    db.query(sql, [ticketId, message], (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
  
      res.json({ success: true, message: 'Reply added successfully', reply_id: result.insertId });
    });
  });
  

  router.post('/cms-page-update', (req, res) => {
    const { slug, user_type, description, status = 1 } = req.body;
  
    const checkSql = 'SELECT * FROM cms_pages WHERE slug = ? AND user_type = ?';
    db.query(checkSql, [slug, user_type], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
  
      if (rows.length > 0) {
        // Update existing
        const updateSql = 'UPDATE cms_pages SET description = ?, status = ? WHERE slug = ? AND user_type = ?';
        db.query(updateSql, [description, status, slug, user_type], (err) => {
          if (err) return res.status(500).json({ error: err.message });
          return res.json({ message: 'CMS content updated successfully' });
        });
      } else {
        // Insert new
        const insertSql = 'INSERT INTO cms_pages (slug, user_type, description, status) VALUES (?, ?, ?, ?)';
        db.query(insertSql, [slug, user_type, description, status], (err) => {
          if (err) return res.status(500).json({ error: err.message });
          return res.json({ message: 'CMS content created successfully' });
        });
      }
    });
  });

  
  router.get('/cms-page/:slug/:user_type', (req, res) => {
    const { slug, user_type } = req.params;
    const sql = 'SELECT * FROM cms_pages WHERE slug = ? AND user_type = ?';
    db.query(sql, [slug, user_type], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      if (rows.length === 0) return res.status(404).json({ message: 'Content not found' });
      res.json(rows[0]);
    });
  });
  

  module.exports = router;

  
