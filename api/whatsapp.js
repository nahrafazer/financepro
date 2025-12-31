const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const supabase = createClient(
    "https://uufpobwisjrocbyuzztx.supabase.co", 
    "sb_publishable_iOq63sd-3dE061qVRxFkYw_JNEHMaeV"
);

module.exports = async (req, res) => {
    const FONNTE_TOKEN = "dmexQbhWF6CEjnPYuxr7"; 

    if (req.method === 'POST') {
        const { sender, message } = req.body;
        if (!sender || !message) return res.status(200).send('OK');

        if (message.startsWith('.')) {
            try {
                const { data: userData } = await supabase
                    .from('users')
                    .select('username')
                    .eq('nowa', sender)
                    .maybeSingle();

                if (!userData) {
                    await sendFonnte(sender, FONNTE_TOKEN, "❌ Nomor Anda belum terdaftar.");
                    return res.status(200).send('OK');
                }

                const username = userData.username;
                const command = message.slice(1).trim().toLowerCase();
                const todayDate = new Date().toISOString().split('T')[0];

                // --- FITUR: MENU BANTUAN (.start) ---
                if (command === 'start' || command === 'help') {
                    const helpMenu = `👋 *Halo, ${username}!* Selamat datang di JakNabungYuk Bot.\n\n` +
                                     `Berikut daftar perintah yang bisa Anda gunakan:\n\n` +
                                     `1️⃣ *Catat Transaksi*\n` +
                                     `Format: \`.tipe ket nominal sumber\`\n` +
                                     `Contoh: \`.keluar Bakso 15000 Cash\`\n\n` +
                                     `2️⃣ *Cek Saldo Keseluruhan*\n` +
                                     `Perintah: \`.balance\`\n\n` +
                                     `3️⃣ *Cek Transaksi Hari Ini*\n` +
                                     `Perintah: \`.today\`\n\n` +
                                     `💡 _Tips: Gunakan awalan titik (.) pada setiap perintah._`;
                    
                    await sendFonnte(sender, FONNTE_TOKEN, helpMenu);
                    return res.status(200).send('OK');
                }

                // --- FITUR: CEK SALDO TOTAL (.balance) ---
                if (command === 'balance') {
                    const { data: logs } = await supabase.from('moneytrack').select('tipe, nominal').eq('username', username);
                    let totalMasuk = 0, totalKeluar = 0;
                    logs.forEach(item => {
                        if (item.tipe === 'pemasukan') totalMasuk += item.nominal;
                        else totalKeluar += item.nominal;
                    });
                    const report = `💰 *LAPORAN SALDO*\n👤 User: ${username}\n\n` +
                                   `➕ Masuk: Rp ${totalMasuk.toLocaleString('id-ID')}\n` +
                                   `➖ Keluar: Rp ${totalKeluar.toLocaleString('id-ID')}\n` +
                                   `────────────────\n` +
                                   `💵 *Sisa Saldo: Rp ${(totalMasuk - totalKeluar).toLocaleString('id-ID')}*`;
                    await sendFonnte(sender, FONNTE_TOKEN, report);
                    return res.status(200).send('OK');
                }

                // --- FITUR: CEK TRANSAKSI HARI INI (.today) ---
                if (command === 'today') {
                    const { data: logs } = await supabase.from('moneytrack').select('tipe, keterangan, nominal, source').eq('username', username).eq('tanggal', todayDate);
                    if (!logs || logs.length === 0) {
                        await sendFonnte(sender, FONNTE_TOKEN, `📅 *Hari Ini (${todayDate})*\nBelum ada transaksi tercatat.`);
                        return res.status(200).send('OK');
                    }
                    let listMsg = `📅 *TRANSAKSI HARI INI*\n(${todayDate})\n\n`, dailyOut = 0;
                    logs.forEach((item, i) => {
                        const simbol = item.tipe === 'pemasukan' ? '➕' : '➖';
                        listMsg += `${i+1}. ${simbol} ${item.keterangan} (Rp ${item.nominal.toLocaleString('id-ID')}) via ${item.source}\n`;
                        if (item.tipe === 'pengeluaran') dailyOut += item.nominal;
                    });
                    listMsg += `\n────────────────\n📉 Total Pengeluaran: *Rp ${dailyOut.toLocaleString('id-ID')}*`;
                    await sendFonnte(sender, FONNTE_TOKEN, listMsg);
                    return res.status(200).send('OK');
                }

                // --- FITUR: CATAT DATA ---
                const parts = message.slice(1).trim().split(/\s+/);
                if (parts.length >= 4) {
                    const tipeRaw = parts[0], keterangan = parts[1], nominalRaw = parts[2];
                    const source = parts.slice(3).join(" ");
                    const tipe = tipeRaw.toLowerCase().includes('masuk') ? 'pemasukan' : 'pengeluaran';
                    const nominal = parseInt(nominalRaw.replace(/\D/g, ''));
                    const { error } = await supabase.from('moneytrack').insert([{ username, tipe, keterangan, nominal, source, tanggal: todayDate }]);
                    if (!error) await sendFonnte(sender, FONNTE_TOKEN, `✅ *Tercatat!*\n📝 ${keterangan}\n💰 Rp ${nominal.toLocaleString('id-ID')}\n🏦 ${source}`);
                } else {
                    await sendFonnte(sender, FONNTE_TOKEN, "Format salah! Ketik *.help* untuk melihat bantuan.");
                }
            } catch (err) {
                console.error(err);
                await sendFonnte(sender, FONNTE_TOKEN, "❌ Terjadi kesalahan sistem.");
            }
        }
        return res.status(200).send('OK');
    }
    res.status(405).send('Method Not Allowed');
};

async function sendFonnte(to, token, text) {
    try {
        await axios.post('https://api.fonnte.com/send', { target: to, message: text }, {
            headers: { 'Authorization': token }
        });
    } catch (e) { console.error("Error:", e.message); }
}
