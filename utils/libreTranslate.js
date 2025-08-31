const axios = require("axios");

const LIBRE_API = "http://127.0.0.1:5000/translate"; 
// or "https://libretranslate.com/translate"

async function translateText(text, sourceLang, targetLang) {
  try {
    const response = await axios.post(
      LIBRE_API,
      {
        q: text,
        source: sourceLang,
        target: targetLang,
        format: "text"
      },
      { headers: { "Content-Type": "application/json" } }
    );
    return response.data.translatedText;
  } catch (error) {
    console.error("Translation error:", error.response?.data || error.message);
    throw error;
  }
}

module.exports = translateText;
