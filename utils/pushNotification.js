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
const { promisePool } = require("../db/connection");

async function sendPushNotification(token, title, body, data = {}, userId) {
  try {
    const userIds = Array.isArray(userId) ? userId : [userId];

    for (const uid of userIds) {
      await promisePool.query(
        "INSERT INTO notifications (user_id, title, body, data, type) VALUES (?, ?, ?, ?, ?)",
        [uid, title, body, JSON.stringify(data), data.type || "general"]
      );
    }

    const message = {
      notification: { title, body },
      data: stringifyData({
        title,
        body,
        ...data,
      }),
      tokens: Array.isArray(token) ? token : [token],
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    console.log(JSON.stringify(response, null, 2));

    console.log("✅ Notification sent:", response.successCount);
    return response;

  } catch (error) {
    console.error("❌ Error sending notification:", error);
    throw error;
  }
}

module.exports = sendPushNotification;
