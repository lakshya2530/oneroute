const express = require("express");
const translateText = require("../utils/libreTranslate");

const router = express.Router();

router.post("/", async (req, res) => {
  const { text, source, target } = req.body;

  try {
    const translated = await translateText(text, source, target);
    res.json({ translated });
  } catch (err) {
    res.status(500).json({ error: "Translation failed" });
  }
});

module.exports = router;
