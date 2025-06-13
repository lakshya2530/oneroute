const express = require('express');
const router = express.Router();
// const { Application } = require('../models');
// const { Like } = require('../models');
// const { Job } = require('../models');
// const { Event } = require('../models');

const { Application, Like, Job, Event, sequelize } = require('../models'); // Make sure 'sequelize' is destructured
const { Op } = require('sequelize'); // Import Sequelize operators


//const { Application, Connection, Like, Review, Job, Message, Event } = require('../models');
const authMiddleware = require('../middleware/auth');

router.get('/',authMiddleware, async (req, res) => {
    try {
        console.log(req);
      // const userId = req.user.user_id; // dynamically take logged in user id
      const userId = req.user.user_id;
      const applicationCount = await Application.count({ where: { user_id: userId } });
     // const connectionCount = await Connection.count({ where: { user_id: userId } });
      const likeCount = await Like.count({ where: { user_id: userId } });
    //   const reviewRating = await Review.findOne({
    //     attributes: [[sequelize.fn('AVG', sequelize.col('rating')), 'averageRating']],
    //     where: { user_id: userId },
    //   });
    const reviewRating =0;
    const applicationApplied = await Application.findAll({
     // limit: 3,
      order: [['createdAt', 'DESC']], // Adjust if your timestamp field is different
      where: {
        user_id: userId, // Optional: filter jobs by user_id if needed
      },
    });
    const recentJobs = await Job.findAll({
        limit: 3,
        order: [['createdAt', 'DESC']], // Adjust if your timestamp field is different
        // where: {
        //   user_id: userId, // Optional: filter jobs by user_id if needed
        // },
      });


    // Fetch the upcoming 3 events starting from today's date
    const today = new Date();
    const upcomingEvents = await Event.findAll({
      limit: 3,
      where: {
        date: {
          [Op.gte]: today, // Ensure event date is greater than or equal to today
        },
      },
      order: [['date', 'ASC']], // Order by event_date ascending (earliest first)
    });
      res.json({
        success: true,
        data: {
          applications: applicationCount,
          connections: 0,
          likes: likeCount,
          rating: Number(reviewRating?.dataValues?.averageRating || 0).toFixed(1),
          recentJobs: recentJobs,
          upcomingEvents: upcomingEvents,
          applicationApplied:applicationApplied
        }
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: 'Server Error', error: err.message });
    }
  });
  
  

  module.exports = router;
