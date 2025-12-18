const admin = require("firebase-admin");
const path = require("path");

const serviceAccount = require(path.join(__dirname, "bidzord-88c4416f9619.json"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

module.exports = admin;
