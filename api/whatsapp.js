const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

// Inisialisasi Supabase
const supabase = createClient(
    "https://uufpobwisjrocbyuzztx.supabase.co", 
    "sb_publishable_iOq63sd-3dE061qVRxFkYw_JNEHMaeV"
);

module.exports = async (req, res) => {
    // TOKEN FONNTE ANDA (Hardcoded)
    const FONNTE_TOKEN = "dmexQbhWF6CEjnPYuxr7"; 

    if (req.method === 'POST') {
        // Ambil data dari Webhook Fonnte
        const { sender, message } = req.body;

        if (!sender || !message) {
            return res.status(200).send('Payload tidak lengkap');
        }

        try {
            // 1. Cari user berdasarkan nomor pengirim
            const { data: userData, error: userError } = await supabase
                .from('users')
                .select('username')
                .eq('nowa', sender)
                .maybeSingle();

            if (userError || !userData) {
                // Beri tahu nomor belum terdaftar (Gunakan 62xxx di database)
                await sendFonnte(sender, FONNTE_TOKEN, `❌ Nomor *${sender}* belum terdaftar. Silakan register di web dengan nomor ini.`);
                return res.status(200).send('User not found');
            }

            const username = userData.username;

            // 2. Logika Parsing Pesan: tipe;keterangan;nominal;sumber
            const parts = message.split(';');
            
            if (parts.length >= 4) {
                const [tipeRaw, keterangan, nominalRaw, source] = parts.map(p => p.trim());
                
                // Normalisasi Tipe & Nominal
                const tipe = tipeRaw.toLowerCase().includes('masuk') ? 'pemasukan' : 'pengeluaran';
                const nominal = parseInt(nominalRaw.replace(/\D/g, ''));

                // 3. Simpan data ke tabel 'moneytrack'
                const { error: insertError } = await supabase.from('moneytrack').insert([{
                    username: username,
                    tipe: tipe,
                    keterangan: keterangan,
                    nominal: nominal,
                    source: source,
                    tanggal: new Date().toISOString().split('T')[0]
                }]);

                if (!insertError) {
                    const successMsg = `✅ *Tercatat!*\n\n` +
                                       `👤 User: ${username}\n` +
                                       `📝 Ket: ${keterangan}\n` +
                                       `💰 Nom: Rp ${nominal.toLocaleString('id-ID')}\n` +
                                       `🏦 Via: ${source}`;
                    await sendFonnte(sender, FONNTE_TOKEN, successMsg);
                } else {
                    await sendFonnte(sender, FONNTE_TOKEN, "❌ Database Error: Gagal menyimpan data.");
                }
            } else {
                // Panduan format jika chat tidak sesuai
                const helpMsg = `Gunakan format:\n*Tipe;Keterangan;Nominal;Sumber*\n\nContoh:\n_pengeluaran;Beli Kopi;25000;Cash_`;
                await sendFonnte(sender, FONNTE_TOKEN, helpMsg);
            }
        } catch (err) {
            console.error("Internal Error:", err);
        }
        return res.status(200).send('OK');
    }

    res.status(405).send('Method Not Allowed');
};

// Fungsi kirim pesan ke API Fonnte
async function sendFonnte(to, token, text) {
    try {
        await axios.post('https://api.fonnte.com/send', {
            target: to,
            message: text,
            countryCode: '62' // Kode negara default Indonesia
        }, {
            headers: { 'Authorization': token }
        });
    } catch (e) {
        console.error("Fonnte Send Error:", e.response?.data || e.message);
    }
}
