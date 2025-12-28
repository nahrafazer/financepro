const { createClient } = require('@supabase/supabase-js');
const TelegramBot = require('node-telegram-bot-api');

// Data yang Anda berikan
const SUPABASE_URL = "https://uufpobwisjrocbyuzztx.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1ZnBvYndpc2pyb2NieXV6enR4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjY3MzEyMywiZXhwIjoyMDgyMjQ5MTIzfQ.vcKYItJ1b8g7B4cVnXmn12nr1xJso9h7pO1vjjNlO64";
const token = '8233970005:AAF5GMoEkA5Rneioq3QFuqhr1cxMhIjGMbE';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const bot = new TelegramBot(token);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(200).send('Webhook is active');
    }

    const { message } = req.body;

    if (message && message.text) {
        const chatId = message.chat.id.toString();
        const text = message.text;

        // Perintah /start untuk mengecek ID
        if (text.startsWith('/start')) {
            try {
                // Cari user berdasarkan tele_id
                const { data: user, error: userError } = await supabase
                    .from('users')
                    .select('username')
                    .eq('tele_id', chatId)
                    .maybeSingle();

                if (user && user.username) {
                    // Jika terdaftar, sapa dengan username
                    await bot.sendMessage(chatId, `Halo, ${user.username}! 👋\n\nSelamat datang kembali di MoneyTrack Bot. Anda bisa langsung mencatat transaksi menggunakan perintah /catat.`);
                } else {
                    // Jika belum terdaftar, berikan ID untuk registrasi
                    await bot.sendMessage(chatId, `Halo! 👋\n\nID Telegram Anda adalah: ${chatId}.\n\nSepertinya ID ini belum terhubung dengan akun MoneyTrack. Silakan daftar atau update profil Anda di website dengan menyertakan ID tersebut.`);
                }
            } catch (err) {
                await bot.sendMessage(chatId, "Terjadi gangguan saat menyapa. Coba lagi nanti.");
            }
            return res.status(200).send('OK');
        }

        // Format: /catat [tipe] [nominal] [keterangan] [sumber]
        if (text.startsWith('/catat')) {
            const parts = text.split(' ');
            if (parts.length < 4) {
                await bot.sendMessage(chatId, "⚠️ Format salah! Gunakan:\n/catat [tipe] [nominal] [keterangan] [sumber]\n\nContoh:\n/catat pengeluaran 15000 Bakso BCA");
                return res.status(200).send('OK');
            }

            const [_, tipe, nominal, keterangan, source] = parts;

            try {
                // 1. Cari user berdasarkan tele_id
                const { data: user, error: userError } = await supabase
                    .from('users')
                    .select('username')
                    .eq('tele_id', chatId)
                    .maybeSingle();

                if (userError || !user) {
                    await bot.sendMessage(chatId, `❌ Akun tidak ditemukan. Daftarkan ID: ${chatId} di menu Register web.`);
                    return res.status(200).send('OK');
                }

                // 2. Simpan transaksi
                const { error: insertError } = await supabase
                    .from('moneytrack')
                    .insert([{
                        username: user.username,
                        tipe: tipe.toLowerCase(), // pemasukan atau pengeluaran
                        nominal: parseInt(nominal),
                        keterangan: keterangan,
                        source: source || 'Cash',
                        tanggal: new Date().toISOString().split('T')[0]
                    }]);

                if (insertError) throw insertError;

                await bot.sendMessage(chatId, `✅ Berhasil mencatat ${tipe} sebesar Rp ${parseInt(nominal).toLocaleString('id-ID')} untuk "${keterangan}".`);
            } catch (err) {
                await bot.sendMessage(chatId, "❌ Terjadi kesalahan sistem saat menyimpan data.");
            }
        }
    }
    return res.status(200).send('OK');

}
