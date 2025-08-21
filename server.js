

// const express = require('express');
// const cors = require('cors');
// const fs = require('fs');
// require('dotenv').config();
// const { Server } = require('socket.io');

// const app = express();
// let server;

// // ⚙️ Determine environment
// if (process.env.NODE_ENV === 'production') {
//   const https = require('https');

//   // ✅ Ensure these files exist (generate with OpenSSL if needed)
//   const options = {
//     key: fs.readFileSync('./ssl/private-key.pem'),
//     cert: fs.readFileSync('./ssl/certificate.pem'),
//   };

//   server = https.createServer(options, app);
//   console.log('🚀 Running in HTTPS (production) mode');
// } else {
//   const http = require('http');
//   server = http.createServer(app);
//   console.log('🚀 Running in HTTP (development) mode');
// }

// // ✅ Initialize Socket.IO
// const io = new Server(server, {
//   cors: {
//     origin: '*',
//     methods: ['GET', 'POST'],
//   },
// });

// // 🌐 Middleware
// app.use(cors());
// app.use(express.json());
// app.use('/uploads', express.static('uploads'));

// // 🛣️ Routes
// const userAdminDashboardRoutes = require('./routes/admin');
// const productRoutes = require('./routes/product');
// const vendorAuthRoutes = require('./routes/vendor-auth');
// const vendorShopRoutes = require('./routes/vendor-shop');
// const vendorProductRoutes = require('./routes/vendor-product');
// const vendorAdRoutes = require('./routes/vendor-ads');
// const customerAuthRoutes = require('./routes/customer-auth');
// const customerHomeRoutes = require('./routes/customer-home');

// app.use('/admin', userAdminDashboardRoutes);
// app.use('/admin', productRoutes);
// app.use('/api', vendorAuthRoutes);
// app.use('/api', vendorShopRoutes);
// app.use('/api/vendor', vendorProductRoutes);
// app.use('/api', vendorAdRoutes);
// app.use('/api', customerAuthRoutes);
// app.use('/api', customerHomeRoutes);

// // 💬 Real-time socket handling
// io.on('connection', (socket) => {
//   console.log('✅ User connected:', socket.id);

//   socket.on('join', (userId) => {
//     socket.join(userId);
//     console.log(`User ${userId} joined their room`);
//   });

//   socket.on('send_message', (data) => {
//     const { sender_id, receiver_id, content } = data;

//     io.to(receiver_id).emit('receive_message', {
//       sender_id,
//       receiver_id,
//       content,
//       created_at: new Date()
//     });
//   });

//   socket.on('disconnect', () => {
//     console.log('❌ User disconnected:', socket.id);
//   });
// });

// // 🚀 Start server
// server.listen(3000, () => {
//   console.log(`✅ Server running on port 3000`);
// });


const express = require('express');
const cors = require('cors');
const fs = require('fs');
const http = require('http');
const https = require('https');
const dotenv = require('dotenv');
const { Server } = require('socket.io');

dotenv.config();

const app = express();

// ✅ HTTPS credentials (make sure these files exist)
const httpsOptions = {
  key: fs.readFileSync('./ssl/private-key.pem'),
  cert: fs.readFileSync('./ssl/certificate.pem'),
};

// ✅ Create HTTP and HTTPS servers
const httpServer = http.createServer(app);
const httpsServer = https.createServer(httpsOptions, app);

// ✅ Initialize Socket.IO on both servers
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

const ioSecure = new Server(httpsServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// 🌐 Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// 🛣️ Routes
const userAdminDashboardRoutes = require('./routes/admin');
const productRoutes = require('./routes/product');
const vendorAuthRoutes = require('./routes/vendor-auth');
const vendorShopRoutes = require('./routes/vendor-shop');
const vendorProductRoutes = require('./routes/vendor-product');
const vendorAdRoutes = require('./routes/vendor-ads');
const customerAuthRoutes = require('./routes/customer-auth');
const customerHomeRoutes = require('./routes/customer-home');
const deliveryHomeRoutes = require('./routes/delivery-home');
const deliveryAuthRoutes = require('./routes/delivery-auth');

app.use('/admin', userAdminDashboardRoutes);
app.use('/admin', productRoutes);
app.use('/api', vendorAuthRoutes);
app.use('/api', vendorShopRoutes);
app.use('/api/vendor', vendorProductRoutes);
app.use('/api', vendorAdRoutes);
app.use('/api', customerAuthRoutes);
app.use('/api', customerHomeRoutes);
app.use('/api', deliveryHomeRoutes);
app.use('/api', deliveryAuthRoutes);

// 💬 Real-time socket handling
const socketHandler = (socket) => {
  console.log('✅ User connected:', socket.id);

  socket.on('join', (userId) => {
    socket.join(userId);
    console.log(`User ${userId} joined their room`);
  });

  socket.on('send_message', (data) => {
    const { sender_id, receiver_id, content } = data;

    socket.to(receiver_id).emit('receive_message', {
      sender_id,
      receiver_id,
      content,
      created_at: new Date()
    });
  });

  socket.on('disconnect', () => {
    console.log('❌ User disconnected:', socket.id);
  });
};

// Attach socket handlers
io.on('connection', socketHandler);
ioSecure.on('connection', socketHandler);

// 🚀 Start both servers
httpServer.listen(3000, () => {
  console.log('✅ HTTP server running on port 3000');
});

httpsServer.listen(443, () => {
  console.log('🔐 HTTPS server running on port 443');
});

