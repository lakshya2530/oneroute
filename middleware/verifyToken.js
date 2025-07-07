// middleware/verifyToken.js
const jwt = require('jsonwebtoken');

module.exports = function (req, res, next) {
  const token = req.headers['authorization'];

  if (!token) return res.status(401).json({ message: 'Access denied. No token provided.' });

  try {
    const decoded = jwt.verify(token.replace('Bearer ', ''), 'your_jwt_secret');
    req.user = decoded; // Attach decoded payload to req.user
    console.log(decoded,'decoded');
    next();
  } catch (err) {
    return res.status(400).json({ message: 'Invalid token' });
  }
};
