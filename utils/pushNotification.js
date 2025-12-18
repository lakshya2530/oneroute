const admin = require("../config/firebase");

/**
 * Send push notification using Firebase Cloud Messaging v1
 * @param {string | string[]} token - FCM device token(s)
 * @param {string} title - Notification title
 * @param {string} body - Notification message
 * @param {object} data - Extra payload data (optional)
 */
async function sendPushNotification(token, title, body, data = {}) {
  try {
    const message = {
      notification: { title, body },
      data: data,
      tokens: Array.isArray(token) ? token : [token],
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    console.log("✅ Notification sent:", response.successCount, "success");
    return response;
  } catch (error) {
    console.error("❌ Error sending notification:", error);
    throw error;
  }
}

module.exports = sendPushNotification;
