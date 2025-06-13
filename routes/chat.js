const express = require('express');
const router = express.Router();
// const { Message, User } = require('../models');
const { Op, Sequelize } = require('sequelize');
const authenticateToken = require("../middleware/auth");
const { ChatRequest, Message,User } = require('../models');

// 📨 Inbox (last conversations)
// router.get('/inbox/:userId', async (req, res) => {
//   try {
//     const { userId } = req.params;

//     const inbox = await Message.findAll({
//       where: {
//         [Op.or]: [
//           { sender_id: userId },
//           { receiver_id: userId }
//         ]
//       },
//       include: [
//         { model: User, as: 'Sender', attributes: ['id', 'username'] },
//         { model: User, as: 'Receiver', attributes: ['id', 'username'] }
//       ],
//       order: [['created_at', 'DESC']]
//     });

//     res.json({ success: true, inbox });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ success: false, message: 'Server Error', error: error.message });
//   }
// });

// // 📨 Full chat between two users
// router.get('/messages/:userId/:otherUserId', async (req, res) => {
//   try {
//     const { userId, otherUserId } = req.params;

//     const messages = await Message.findAll({
//       where: {
//         [Op.or]: [
//           { sender_id: userId, receiver_id: otherUserId },
//           { sender_id: otherUserId, receiver_id: userId }
//         ]
//       },
//       order: [['created_at', 'ASC']]
//     });

//     res.json({ success: true, messages });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ success: false, message: 'Server Error', error: error.message });
//   }
// });

// // 📨 Send message
// router.post('/send', async (req, res) => {
//   try {
//     const { sender_id, receiver_id, content } = req.body;

//     if (!sender_id || !receiver_id || !content) {
//       return res.status(400).json({ success: false, message: 'All fields are required' });
//     }

//     const message = await Message.create({
//       sender_id,
//       receiver_id,
//       content
//     });

//     res.json({ success: true, message });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ success: false, message: 'Server Error', error: error.message });
//   }
// });


// Send a new message (store in DB)
router.post('/send', async (req, res) => {
  try {
    const { sender_id, receiver_id, content } = req.body;

    if (!sender_id || !receiver_id || !content) {
      return res.status(400).json({ success: false, message: 'Missing fields' });
    }

    // const chatRequest = await ChatRequest.findOne({
    //   where: {
    //     sender_id: receiver_id,
    //     receiver_id: sender_id,
    //     status: 'accepted'
    //   }
    // });
    // const chatRequest = await ChatRequest.findOne({
    //   where: {
    //     [Op.or]: [
    //       { sender_id, receiver_id, status: 'accepted' },
    //       { sender_id: receiver_id, receiver_id: sender_id, status: 'accepted' }
    //     ]
    //   }
    // });
    let is_first_time = false;

    //if (!chatRequest) {
      // ✅ 2. Check if sender has already sent a pending request
      const pendingRequest = await ChatRequest.findOne({
        where: {
          sender_id,
          receiver_id
        }
      });

      const existingRequest = await ChatRequest.findOne({
        where: {
          [Op.or]: [
            { sender_id, receiver_id },
            { sender_id: receiver_id, receiver_id: sender_id }
          ]
        }
      });

      if (!existingRequest) {
        await ChatRequest.create({
          sender_id,
          receiver_id,
          status: 'pending'
        });
        is_first_time = true;

        // return res.status(200).json({
        //   success: true,
        //   is_first_time: true,
        //   message: 'First-time chat request sent. Waiting for approval.',
        //   requestSent: true
        // });
        
      }

      // return res.status(403).json({
      //   success: false,
      //   is_first_time: true,
      //   message: 'Chat request pending. Wait for receiver to accept.',
      //   requestSent: true
      // });
    //}

    const newMessage = await Message.create({ sender_id, receiver_id, content });
    return res.json({ success: true, message: 'Message sent',is_first_time, data: newMessage });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
});


router.post('/respond', authenticateToken, async (req, res) => {
  try {
    const { request_id, action } = req.body;

    // ✅ Validate request input
    if (!request_id || !['accept', 'reject'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid input. Must include request_id and action (accept/reject)'
      });
    }

    // ✅ Get user ID from token
    const receiverId = req.user.user_id;

    // ✅ Find the request
    const chatRequest = await ChatRequest.findByPk(request_id);

    if (!chatRequest) {
      return res.status(404).json({ success: false, message: 'Chat request not found' });
    }

    // ✅ Only receiver can respond
    if (chatRequest.receiver_id !== receiverId) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    // ✅ Update the status
    chatRequest.status = action === 'accept' ? 'accepted' : 'rejected';
    await chatRequest.save();

    res.json({
      success: true,
      message: `Chat request ${action}ed successfully.`,
      data: chatRequest
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});
// Get all messages between two users
router.get('/conversation/:user1_id/:user2_id', async (req, res) => {
  try {
    const { user1_id, user2_id } = req.params;

    const messages = await Message.findAll({
      where: {
        [Op.or]: [
          { sender_id: user1_id, receiver_id: user2_id },
          { sender_id: user2_id, receiver_id: user1_id }
        ]
      },
      order: [['created_at', 'ASC']]
    });

    return res.json({ success: true, data: messages });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
});

// List recent chats for a user
// router.get('/list/:user_id', async (req, res) => {
//   try {
//     const { user_id } = req.params;

//     const latestMessages = await Message.findAll({
//       where: {
//         [Op.or]: [
//           { sender_id: user_id },
//           { receiver_id: user_id }
//         ]
//       },
//       attributes: [
//         'id',
//         'sender_id',
//         'receiver_id',
//         'content',
//         'created_at',
//         [Sequelize.literal(`
//           CASE 
//             WHEN sender_id = ${user_id} THEN receiver_id
//             ELSE sender_id
//           END
//         `), 'conversation_with']
//       ],
//       order: [['created_at', 'DESC']],
//       raw: true
//     });

//     // Deduplicate by conversation_with
//     const seen = new Set();
//     const filtered = latestMessages.filter(msg => {
//       const key = msg.conversation_with;
//       if (seen.has(key)) return false;
//       seen.add(key);
//       return true;
//     });

//     res.status(200).json({
//       success: true,
//       data: filtered
//     });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({
//       success: false,
//       message: 'Server Error',
//       error: error.message
//     });
//   }
// });



router.get('/list/:user_id', async (req, res) => {
  try {
    const { user_id } = req.params;

    // Fetch messages
    const messages = await Message.findAll({
      where: {
        [Op.or]: [
          { sender_id: user_id },
          { receiver_id: user_id }
        ]
      },
      attributes: [
        'id',
        'sender_id',
        'receiver_id',
        'content',
        'created_at',
        [Sequelize.literal(`
          CASE 
            WHEN sender_id = ${user_id} THEN receiver_id
            ELSE sender_id
          END
        `), 'conversation_with']
      ],
      order: [['created_at', 'DESC']],
      raw: true
    });

    // Deduplicate by conversation_with
    const seen = new Set();
    const filtered = [];
    for (const msg of messages) {
      const key = msg.conversation_with;
      if (!seen.has(key)) {
        seen.add(key);
        filtered.push(msg);
      }
    }

    // Fetch opposite user details
    const userIds = filtered.map(m => m.conversation_with);
    const users = await User.findAll({
      where: { id: userIds },
      attributes: ['id', 'username', 'profile_image'],
      raw: true
    });

    const userMap = {};
    users.forEach(u => {
      userMap[u.id] = u;
    });

    // Add user info to messages
    const enriched = filtered.map(msg => ({
      ...msg,
      user: userMap[msg.conversation_with] || {}
    }));

    res.status(200).json({
      success: true,
      data: enriched
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server Error',
      error: error.message
    });
  }
});

// router.get('/list/:user_id', async (req, res) => {
//   try {
//     const { user_id } = req.params;

//     const messages = await Message.findAll({
//       where: {
//         [Op.or]: [
//           { sender_id: user_id },
//           { receiver_id: user_id }
//         ]
//       },
//       order: [['created_at', 'DESC']],
//       limit: 20 // Latest 20 messages
//     });

//     return res.json({ success: true, data: messages });
//   } catch (error) {
//     console.error(error);
//     return res.status(500).json({ success: false, message: 'Server Error', error: error.message });
//   }
// });

module.exports = router;


