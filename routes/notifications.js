const express = require('express');
const router = express.Router();
const { Notification, NotificationTemplate,User } = require('../models'); 
const authenticateToken = require("../middleware/auth");


router.get('/', authenticateToken, async (req, res) => {
    const userId = req.user.user_id; // Get user ID directly from the decoded token

    console.log("User ID from token:", userId); // Verify userId

    try {
        const notifications = await Notification.findAll({
            where: { user_id: userId }, // Correct query using user_id
            order: [['created_at', 'DESC']]
        });

        res.json({ success: true, data: notifications });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});



router.put('/read-all', authenticateToken, async (req, res) => {
    const userId = req.user.user_id; // Get user ID directly from the decoded token

    console.log("User ID:", userId); // For debugging purposes
  
    try {
        // Mark all notifications as read for the user
        const [updatedCount] = await Notification.update(
            { is_read: true }, // Set 'is_read' to true
            { where: { user_id: userId } } // Filter by the user_id
        );
      
        if (updatedCount === 0) {
            return res.status(404).json({ success: false, message: "No notifications found to mark as read." });
        }

        res.json({ success: true, message: `${updatedCount} notifications marked as read.` });
    } catch (err) {
        console.error("Error:", err); // Log any error for debugging
        res.status(500).json({ success: false, message: err.message });
    }
});

  
router.post('/admin/template', async (req, res) => {
    const { title, message, type, audience, status } = req.body;
  
    try {
      const template = await NotificationTemplate.create({
        title,
        message,
        type,
        audience,
        status
      });
  
      // If status = Sent, send to all users immediately
      if (status === 'Sent') {
        const users = await User.findAll({ attributes: ['id'] });
  
        const bulkNotifications = users.map(user => ({
          user_id: user.id,
          type,
          sender_id: null,
          reference_id: template.id,
          content: message,
          is_read: false
        }));
  
        await Notification.bulkCreate(bulkNotifications);
      }
  
      res.status(201).json(template);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  

  router.get('/admin/template', async (req, res) => {
    const { status } = req.query;
    const where = {};
    if (status) where.status = status;
  
    try {
      const templates = await NotificationTemplate.findAll({ where });
      res.json(templates);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  

  router.post('/admin/template/:id/send', async (req, res) => {
    try {
      const template = await NotificationTemplate.findByPk(req.params.id);
      if (!template) return res.status(404).json({ error: 'Template not found' });
  
      // Only send if it’s in Draft
      if (template.status === 'Sent') {
        return res.status(400).json({ error: 'Already sent' });
      }
  
      const users = await User.findAll({ attributes: ['id'] });
  
      const bulkNotifications = users.map(user => ({
        user_id: user.id,
        type: template.type,
        sender_id: null,
        reference_id: template.id,
        content: template.message,
        is_read: false
      }));
  
      await Notification.bulkCreate(bulkNotifications);
  
      template.status = 'Sent';
      await template.save();
  
      res.json({ message: 'Notification sent to all users.' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  

  module.exports = router;
