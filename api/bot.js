const { createClient } = require('@supabase/supabase-js');
const TelegramBot = require('node-telegram-bot-api');

const SUPABASE_URL = "https://uufpobwisjrocbyuzztx.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1ZnBvYndpc2pyb2NieXV6enR4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjY3MzEyMywiZXhwIjoyMDgyMjQ5MTIzfQ.vcKYItJ1b8g7B4cVnXmn12nr1xJso9h7pO1vjjNlO64"; // Gunakan Service Role untuk update
const token = '8233970005:AAF5GMoEkA5Rneioq3QFuqhr1cxMhIjGMbE';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const bot = new TelegramBot(token);

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(200).send('Bot is active');

    const { message } = req.body;
    if (!message || !message.text) return res.status(200).send('OK');

    const chatId = message.chat.id.toString();
    const text = message.text;

    try {
        // 1. Ambil User & State
        let { data: user, error: userError } = await supabase
            .from('users')
            .select('*')
            .eq('tele_id', chatId)
            .maybeSingle();

        if (!user) {
            if (text.startsWith('/start')) {
                return await bot.sendMessage(chatId, `Halo! 👋 ID Anda: ${chatId}\nSilakan daftar di web.`);
            }
            return await bot.sendMessage(chatId, "❌ Akun belum terdaftar.");
        }

        const state = user.bot_state;

        // --- LOGIKA STATE MACHINE ---

        // Jika user mengetik /catat (Reset/Mulai awal)
        if (text.startsWith('/catat')) {
            await updateState(chatId, 'WAITING_TIPE', {});
            return await bot.sendMessage(chatId, "Silakan pilih tipe transaksi:", {
                reply_markup: {
                    keyboard: [[{ text: 'Pemasukan' }, { text: 'Pengeluaran' }]],
                    one_time_keyboard: true,
                    resize_keyboard: true
                }
            });
        }

        // Jalankan perintah berdasarkan state
        switch (state) {
            case 'WAITING_TIPE':
                const tipe = text.toLowerCase();
                if (tipe !== 'pemasukan' && tipe !== 'pengeluaran') {
                    return await bot.sendMessage(chatId, "Mohon pilih: Pemasukan atau Pengeluaran");
                }
                await updateState(chatId, 'WAITING_NOMINAL', { tipe });
                await bot.sendMessage(chatId, "Berapa jumlah nominalnya? (Hanya angka)");
                break;

            case 'WAITING_NOMINAL':
                const nominal = parseInt(text.replace(/[^0-9]/g, ''));
                if (isNaN(nominal)) return await bot.sendMessage(chatId, "Masukkan angka yang valid.");
                
                await updateState(chatId, 'WAITING_KETERANGAN', { ...user.temp_data, nominal });
                await bot.sendMessage(chatId, "Apa keterangan transaksinya?");
                break;

            case 'WAITING_KETERANGAN':
                await updateState(chatId, 'WAITING_SOURCE', { ...user.temp_data, keterangan: text });
                await bot.sendMessage(chatId, "Sumber dananya dari mana? (Contoh: Cash, Bank, E-Wallet)");
                break;

            case 'WAITING_SOURCE':
                const finalData = { ...user.temp_data, source: text };
                
                // Simpan ke Tabel Moneytrack
                const { error: insertError } = await supabase
                    .from('moneytrack')
                    .insert([{
                        username: user.username,
                        tipe: finalData.tipe,
                        nominal: finalData.nominal,
                        keterangan: finalData.keterangan,
                        source: finalData.source,
                        tanggal: new Date().toISOString().split('T')[0]
                    }]);

                if (insertError) throw insertError;

                // Reset State
                await updateState(chatId, null, null);
                await bot.sendMessage(chatId, `✅ Berhasil mencatat!\n\n📌 *${finalData.tipe.toUpperCase()}*\n💰 Rp ${finalData.nominal.toLocaleString('id-ID')}\n📝 ${finalData.keterangan}\n🏦 ${finalData.source}`, { parse_mode: 'Markdown' });
                break;

            default:
                if (text.startsWith('/balance')) {
                    // Logika /balance tetap sama seperti sebelumnya
                    await handleBalance(chatId, user);
                }
                break;
        }

    } catch (err) {
        console.error(err);
        await bot.sendMessage(chatId, "❌ Terjadi kesalahan pada sistem.");
    }

    return res.status(200).send('OK');
}

// Fungsi pembantu untuk update state di DB
async function updateState(teleId, state, data) {
    await supabase
        .from('users')
        .update({ bot_state: state, temp_data: data })
        .eq('tele_id', teleId);
}

