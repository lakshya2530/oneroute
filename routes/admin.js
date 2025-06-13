const express = require('express');
const router = express.Router();
const { User, Job, Application,Post, Event,Notification } = require('../models');
const { Op, Sequelize } = require('sequelize');
const authenticateAdmin = require('../middleware/auth'); // custom middleware to check admin
const db = require('../db/connection');

// Create
router.post('/vendor-register', (req, res) => {
    const {
        full_name, age, gender, email, phone,
        type, registration_date, shop_name,
        shop_certificate, status
    } = req.body;

    const sql = `INSERT INTO vendors SET ?`;
    const vendor = {
        full_name, age, gender, email, phone,
        type, registration_date, shop_name,
        shop_certificate, status
    };

    db.query(sql, vendor, (err, result) => {
        if (err) return res.status(500).send(err);
        res.json({ id: result.insertId, ...vendor });
    });
});

// List
router.get('/vendor-list', (req, res) => {
    db.query('SELECT * FROM vendors', (err, rows) => {
        if (err) return res.status(500).send(err);
        res.json(rows);
    });
});

// Edit
router.put('/update-vendor/:id', (req, res) => {
    const { id } = req.params;
    const updatedData = req.body;

    db.query('UPDATE vendors SET ? WHERE id = ?', [updatedData, id], (err, result) => {
        if (err) return res.status(500).send(err);
        res.json({ message: 'Vendor updated successfully' });
    });
});

// Delete
router.delete('/vendor/:id', (req, res) => {
    const { id } = req.params;

    db.query('DELETE FROM vendors WHERE id = ?', [id], (err, result) => {
        if (err) return res.status(500).send(err);
        res.json({ message: 'Vendor deleted successfully' });
    });
});

module.exports = router;

