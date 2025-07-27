
const mysql = require('mysql2');

// const connection = mysql.createConnection({
//     host: 'localhost',
//     user: 'root',
//     password: '', // update your password
//     database: 'ecommerce_db'
// });
const connection = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'ecommerce_db',
    connectionLimit: 10
  });

// connection.connect((err) => {
//     if (err) throw err;
//     console.log('Connected to MySQL');
// });

module.exports = connection;


// const { Pool } = require("pg");
// require("dotenv").config();

// const pool = new Pool({
//   host: process.env.DB_HOST,
//   port: process.env.DB_PORT,
//   user: process.env.DB_USER,
//   password: process.env.DB_PASSWORD,
//   database: process.env.DB_NAME,
// });

// module.exports = pool;

// const { Pool } = require("pg");
// require("dotenv").config();

// const pool = new Pool({
//   host: "localhost",
//   user: "postgres",
//   port: "5433",
//   password: String("root123"),
//   database: "castlinker",
// });
// pool
//   .connect()
//   .then(() => console.log("✅ PostgreSQL database connected successfully!"))
//   .catch((err) => console.error("❌ Failed to connect to the database:", err));
// module.exports = pool;
