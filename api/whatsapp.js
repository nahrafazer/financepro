const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

// Inisialisasi Supabase
const supabase = createClient(
    "https://uufpobwisjrocbyuzztx.supabase.co", 
    "sb_publishable_iOq63sd-3dE061qVRxFkYw_JNEHMaeV"
);

module.exports = async (req, res) => {
    // Mengambil Token dari Environment Variable Vercel (Lebih Aman)
    const TOKEN = process.env.WHATSAPP_TOKEN; 
    const PHONE_ID = "855395987667988"; // Phone Number ID dari Meta Dashboard
    const VERIFY_TOKEN = "my_bot_token_123"; // Token yang Anda masukkan di Dashboard Meta

    // --- 1. HANDLING VERIFIKASI WEBHOOK (GET) ---
    if (req.method === 'GET') {
        const mode = req.query['hub.mode'];
        const token = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];

        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log("WEBHOOK_VERIFIED");
            return res.status(200).send(challenge);
        }
        return res.status(403).send('Forbidden');
    }

    // --- 2. HANDLING PESAN MASUK (POST) ---
    if (req.method === 'POST') {
        const body = req.body;
        const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

        // Pastikan ada pesan masuk dan bertipe text
        if (message && message.type === 'text') {
            const from = message.from; // Nomor WhatsApp pengirim (misal: 62812...)
            const text = message.text.body;

            try {
                // A. Cari user di tabel 'users' berdasarkan nomor WhatsApp
                const { data: userData, error: userError } = await supabase
                    .from('users')
                    .select('username')
                    .eq('nowa', from)
                    .maybeSingle();

                if (userError || !userData) {
                    await sendWA(from, TOKEN, PHONE_ID, `❌ Nomor *${from}* belum terdaftar. Silakan daftar di web MoneyTrack terlebih dahulu.`);
                    return res.status(200).send('OK');
                }

                const username = userData.username;

                // B. Parsing Pesan (Format: tipe;keterangan;nominal;sumber)
                const parts = text.split(';');
                
                if (parts.length >= 4) {
                    const [tipeRaw, keterangan, nominalRaw, source] = parts.map(p => p.trim());
                    
                    // Normalisasi data
                    const tipe = tipeRaw.toLowerCase().includes('masuk') ? 'pemasukan' : 'pengeluaran';
                    const nominal = parseInt(nominalRaw.replace(/\D/g, '')); // Hanya ambil angka

                    // C. Simpan ke tabel 'moneytrack'
                    const { error: insertError } = await supabase.from('moneytrack').insert([{
                        username: username,
                        tipe: tipe,
                        keterangan: keterangan,
                        nominal: nominal,
                        source: source,
                        tanggal: new Date().toISOString().split('T')[0]
                    }]);

                    if (!insertError) {
                        const successMsg = `✅ *Tercatat di JakNabungYuk!*\n\n` +
                                           `👤 Akun: ${username}\n` +
                                           `📝 Ket: ${keterangan}\n` +
                                           `💰 Nom: Rp ${nominal.toLocaleString('id-ID')}\n` +
                                           `🏦 Via: ${source}`;
                        await sendWA(from, TOKEN, PHONE_ID, successMsg);
                    } else {
                        throw new Error(insertError.message);
                    }
                } else {
                    // Pesan panduan jika format salah
                    const helpMsg = `Format salah. Gunakan:\n\n*Tipe;Keterangan;Nominal;Sumber*\n\nContoh:\n_pengeluaran;Makan Siang;25000;Cash_`;
                    await sendWA(from, TOKEN, PHONE_ID, helpMsg);
                }
            } catch (err) {
                console.error("Error Detail:", err);
                await sendWA(from, TOKEN, PHONE_ID, "❌ Maaf, terjadi gangguan saat menyimpan data ke database.");
            }
        }
        
        // Selalu kirim 200 OK ke Meta agar mereka tidak mengirim ulang pesan yang sama
        return res.status(200).send('EVENT_RECEIVED');
    }

    res.status(405).send('Method Not Allowed');
};

// --- FUNGSI HELPER KIRIM PESAN ---
async function sendWA(to, token, id, text) {
    try {
        await axios.post(`https://graph.facebook.com/v18.0/${id}/messages`, {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: to,
            type: "text",
            text: { body: text }
        }, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
    } catch (e) {
        console.error("Gagal Kirim WhatsApp:", e.response?.data || e.message);
    }
}
