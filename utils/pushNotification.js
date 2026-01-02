// const admin = require("../config/firebase");
// const { pool } = require("../db/connection");

// /**
//  * Send push notification using Firebase Cloud Messaging v1
//  * @param {string | string[]} token - FCM device token(s)
//  * @param {string} title - Notification title
//  * @param {string} body - Notification message
//  * @param {object} data - Extra payload data (optional)
//  */
// async function sendPushNotification(token, title, body, data = {}, userId) {
//   try {
//     // Store into DB
//     const conn = pool.getConnection();

//     const userIds = Array.isArray(userId) ? userId : [userId];

//     for (const uid of userIds) {
//       await conn.query(
//         "INSERT INTO notifications (user_id, title, body, data, type) VALUES (?, ?, ?, ?, ?)",
//         [uid, title, body, JSON.stringify(data), data.type || "general"]
//       );
//     }

//     conn.release();

//     // Send Push Notification
//     const message = {
//       notification: { title, body },
//       data: data,
//       tokens: Array.isArray(token) ? token : [token],
//     };

//     const response = await admin.messaging().sendEachForMulticast(message);
//     console.log("✅ Notification sent:", response.successCount, "success");
//     return response;
//   } catch (error) {
//     console.error("❌ Error sending notification:", error);
//     throw error;
//   }
// }

// module.exports = sendPushNotification;


const admin = require("../config/firebase");
const { pool } = require("../db/connection");

/**
 * Send push notification using Firebase Cloud Messaging v1
 */
async function sendPushNotification(token, title, body, data = {}, userId) {
  try {
    // Normalize inputs
    const tokens = Array.isArray(token) ? token : [token];
    const userIds = Array.isArray(userId) ? userId : [userId];

    // 1️⃣ Store notification in DB (SAFE)
    for (const uid of userIds) {
      if (!uid) continue;
console.log(111);
      await pool.query(
        `INSERT INTO notifications 
         (user_id, title, body, data, type, created_at)
         VALUES (?, ?, ?, ?, ?, NOW())`,
        [
          uid,
          title,
          body,
          JSON.stringify(data),
          data.type || "general",
        ]
      );
    }

    // 2️⃣ Send push notification
    if (tokens.length > 0) {
      const message = {
        notification: { title, body },
        data: Object.fromEntries(
          Object.entries(data).map(([k, v]) => [k, String(v)])
        ),
        tokens,
      };

      const response = await admin.messaging().sendEachForMulticast(message);

      console.log(
        `✅ Notification sent: ${response.successCount}/${tokens.length}`
      );

      return response;
    }
  } catch (error) {
    console.error("❌ Error sending notification:", error);
    // DO NOT throw — avoid breaking API
    return null;
  }
}

module.exports = sendPushNotification;

