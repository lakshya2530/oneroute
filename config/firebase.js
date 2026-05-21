// const admin = require("firebase-admin");
// const path = require("path");

// const serviceAccount = require(path.join(__dirname, "oneroute-279b4-19c0c45d91b3.json"));

// admin.initializeApp({
//   credential: admin.credential.cert(serviceAccount),
// });

const admin = require("firebase-admin");
const serviceAccount = require("./firebase-key.json");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

module.exports = admin;

