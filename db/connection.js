const mysql = require("mysql2");

const rawPool = mysql.createPool({
  host: "localhost",
  user: "oneroute",
  password: "Oneroute@123",
  database: "oneroute",
  connectionLimit: 10,
  charset: "utf8mb4",
});

const promisePool = rawPool.promise();

const pool = {
  query: (...args) => promisePool.query(...args),

  getConnection: async () => {
    const conn = await promisePool.getConnection();

    return {
      query: (...args) => conn.query(...args),
      beginTransaction: () => conn.beginTransaction(),
      commit: () => conn.commit(),
      rollback: () => conn.rollback(),
      release: () => conn.release(),
    };
  },
};

rawPool.getConnection((err, connection) => {
  if (err) {
    console.error("❌ Database connection failed:", err.message);
  } else {
    console.log("✅ Connected to MySQL Database: oneroute");
    connection.release();
  }
});

module.exports = {
  pool,
  promisePool, // ✅ EXPORT THIS
};
