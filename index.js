const express = require("express");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// ✅ Serve uploads folder publicly
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Test route
app.get("/", (req, res) => {
  res.send("🚀 API is working fine!");
});

// Routes
const userRoutes = require("./routes/users");
const vehicleRoutes = require("./routes/vehicles");
const accountRoutes = require("./routes/account");
const ridesRoutes = require("./routes/rides");
const chatRoutes = require("./routes/chat");

app.use("/api/users", userRoutes);
app.use("/api/vehicles", vehicleRoutes);
app.use("/api/accounts", accountRoutes);
app.use("/api/rides", ridesRoutes);
app.use("/api/chat", chatRoutes);

// Start server
app.listen(PORT, () => {
  console.log(
    `Server running on ${process.env.BASE_URL || "http://localhost:" + PORT}`
  );
});
