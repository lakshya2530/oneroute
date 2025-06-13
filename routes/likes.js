const express = require('express');
const router = express.Router();
const { Like } = require('../models');

// POST: Like a post
router.post('/like', async (req, res) => {
  const { user_id, post_id } = req.body;

  try {
    const [like, created] = await Like.findOrCreate({
      where: { user_id, post_id }
    });

    if (!created) {
      return res.status(200).json({
        success: false,
        message: 'Post already liked'
      });
    }

    res.status(201).json({
      success: true,
      message: 'Post liked successfully',
      data: like
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Error liking post',
      error: err.message
    });
  }
});

// GET: Total likes of a post
router.get('/count/:post_id', async (req, res) => {
  const { post_id } = req.params;

  try {
    const count = await Like.count({ where: { post_id } });

    res.status(200).json({
      success: true,
      post_id,
      like_count: count
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Error fetching like count',
      error: err.message
    });
  }
});


// DELETE: Unlike a post
router.delete('/unlike', async (req, res) => {
    const { user_id, post_id } = req.body;
  
    try {
      const deleted = await Like.destroy({
        where: { user_id, post_id }
      });
  
      if (deleted) {
        return res.status(200).json({
          success: true,
          message: 'Post unliked successfully'
        });
      } else {
        return res.status(404).json({
          success: false,
          message: 'Like not found'
        });
      }
    } catch (err) {
      res.status(500).json({
        success: false,
        message: 'Error unliking post',
        error: err.message
      });
    }
  });
  

  module.exports = router;
