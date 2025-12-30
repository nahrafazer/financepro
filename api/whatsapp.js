const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const supabase = createClient(
    "https://uufpobwisjrocbyuzztx.supabase.co", 
    "sb_publishable_iOq63sd-3dE061qVRxFkYw_JNEHMaeV"
);

export default async function handler(req, res) {
    const TOKEN = "EAATftG4c5JwBQfGnZB7y24AkVFrH7Gga4ZCUXJ5PcEnZA9BK6vv5kQyyZCZC4xnBxv3DPysSDZCZABZC20EVCGHZCcZCMQOZA8i6M53y7cIIZBqdlPvWxoRbUqmdEBKZAPe7YeezCNT9yl92bZC1PeXYo8HDd71Iv1zyyOp8YvrBovlojAvRZBlbODgfvEEGh4vMsVQyPZB10HBGl0OxQ7t5ZABtD2mVKoVexJTeNGr1JZCZBeci9l0vPUFOwZAhzK6dzNVzWhTP2QXr7d1FSMgKH1Ws9ig88vaL8gZDZD"; // Gunakan Token Permanen agar tidak expired
    const PHONE_ID = "855395987667988"; 
    const VERIFY_TOKEN = "my_bot_token_123";

    // --- VERIFIKASI WEBHOOK ---
    if (req.method === 'GET') {
        const mode = req.query['hub.mode'];
        const token = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];
        if (mode === 'subscribe' && token === VERIFY_TOKEN) return res.status(200).send(challenge);
        return res.status(403).send('Forbidden');
    }

    // --- LOGIKA PESAN MASUK ---
    if (req.method === 'POST') {
        const body = req.body;
        const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

        if (message && message.type === 'text') {
            const from = message.from; // Contoh: "62812345678"
            const text = message.text.body;

            // 1. CARI USER BERDASARKAN NOMOR WHATSAPP
            const { data: userData, error: userError } = await supabase
                .from('users')
                .select('username')
                .eq('nowa', from)
                .maybeSingle();

            if (userError || !userData) {
                await sendWA(from, TOKEN, PHONE_ID, "❌ Nomor Anda belum terdaftar di MoneyTrack. Silakan daftar di web terlebih dahulu.");
                return res.status(200).send('OK');
            }

            const username = userData.username;

            // 2. PARSING PESAN (Format: Tipe;Keterangan;Nominal;Sumber)
            const parts = text.split(';');
            
            if (parts.length >= 4) {
                const [tipe, keterangan, nominal, source] = parts.map(p => p.trim());
                const cleanNominal = nominal.replace(/\D/g, ''); // Ambil angka saja

                // 3. SIMPAN KE TABEL MONEYTRACK
                const { error: insertError } = await supabase.from('moneytrack').insert([{
                    username: username,
                    tipe: tipe.toLowerCase().includes('masuk') ? 'pemasukan' : 'pengeluaran',
                    keterangan: keterangan,
                    nominal: parseInt(cleanNominal),
                    source: source,
                    tanggal: new Date().toISOString().split('T')[0]
                }]);

                if (!insertError) {
                    const responseMsg = `✅ *Transaksi Berhasil!*\n\n` +
                                        `👤 User: ${username}\n` +
                                        `📝 Ket: ${keterangan}\n` +
                                        `💰 Nom: Rp ${parseInt(cleanNominal).toLocaleString('id-ID')}\n` +
                                        `🏦 Via: ${source}`;
                    await sendWA(from, TOKEN, PHONE_ID, responseMsg);
                } else {
                    await sendWA(from, TOKEN, PHONE_ID, "❌ Sistem gagal mencatat. Pastikan format benar.");
                }
            } else {
                // Info format jika user bingung
                const helpMsg = `Format salah! Gunakan:\n\n*Tipe;Keterangan;Nominal;Sumber*\n\nContoh:\n_pengeluaran;Beli Kopi;20000;Gopay_`;
                await sendWA(from, TOKEN, PHONE_ID, helpMsg);
            }
        }
        return res.status(200).send('OK');
    }
    res.status(405).send('Method Not Allowed');
}

async function sendWA(to, token, id, text) {
    try {
        await axios.post(`https://graph.facebook.com/v18.0/${id}/messages`, {
            messaging_product: "whatsapp",
            to: to,
            text: { body: text }
        }, { headers: { 'Authorization': `Bearer ${token}` } });
    } catch (e) {
        console.error("Error sending WA:", e.response?.data || e.message);
    }
}