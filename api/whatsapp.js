// api/whatsapp.js

module.exports = async (req, res) => {
  // Pastikan token ini SAMA dengan yang Anda ketik di dashboard Meta
  const VERIFY_TOKEN = "my_bot_token_123";

  // --- 1. HANDLING VERIFIKASI (GET) ---
  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("Webhook Verified!");
      return res.status(200).send(challenge);
    }
    return res.status(403).send("Forbidden");
  }

  // --- 2. HANDLING PESAN MASUK (POST) ---
  if (req.method === "POST") {
    // Balas Meta segera agar tidak timeout
    res.status(200).send("EVENT_RECEIVED");
    
    // Logika Supabase diletakkan di bawah sini setelah kita sukses verifikasi
    console.log("Ada pesan masuk:", JSON.stringify(req.body));
    return;
  }

  res.status(405).send("Method Not Allowed");
};
