const { createClient } = require('@supabase/supabase-js');
const TelegramBot = require('node-telegram-bot-api');

const SUPABASE_URL = "https://uufpobwisjrocbyuzztx.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1ZnBvYndpc2pyb2NieXV6enR4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjY3MzEyMywiZXhwIjoyMDgyMjQ5MTIzfQ.vcKYItJ1b8g7B4cVnXmn12nr1xJso9h7pO1vjjNlO64";
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
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('*')
            .eq('tele_id', chatId)
            .maybeSingle();

        if (text.startsWith('/start')) {
            if (user) {
                return await bot.sendMessage(chatId, `Halo, ${user.username}! 👋\n\nGunakan /catat untuk mulai mengisi data.`);
            } else {
                return await bot.sendMessage(chatId, `Halo! 👋\nID Telegram Anda: ${chatId}\nSilakan daftar di web.`);
            }
        }

        if (!user) return await bot.sendMessage(chatId, "❌ Akun belum terdaftar.");

        // 1. Jika pengguna mengetik /catat
        if (text === '/catat') {
            // Set state user menjadi WAITING_INPUT
            await supabase.from('users').update({ bot_state: 'WAITING_INPUT' }).eq('tele_id', chatId);
            
            return await bot.sendMessage(chatId, 
                "Silakan kirim data dengan format berikut:\n\n`tipe;nominal;keterangan;sumber`\n\nContoh:\n`pengeluaran;50000;makan siang;cash`", 
                { parse_mode: 'Markdown' }
            );
        }

        // 2. Jika user dalam mode WAITING_INPUT dan mengirim pesan
        if (user.bot_state === 'WAITING_INPUT') {
            const parts = text.split(';');

            if (parts.length < 4) {
                return await bot.sendMessage(chatId, "⚠️ Format salah! Gunakan format:\n`tipe;nominal;keterangan;sumber`", { parse_mode: 'Markdown' });
            }

            const [tipe, nominal, keterangan, source] = parts.map(p => p.trim());
            const cleanNominal = parseInt(nominal.replace(/[^0-9]/g, ''));

            if (isNaN(cleanNominal)) {
                return await bot.sendMessage(chatId, "❌ Nominal harus berupa angka.");
            }

            // Simpan ke moneytrack
            const { error: insertError } = await supabase
                .from('moneytrack')
                .insert([{
                    username: user.username,
                    tipe: tipe.toLowerCase(),
                    nominal: cleanNominal,
                    keterangan: keterangan,
                    source: source,
                    tanggal: new Date().toISOString().split('T')[0]
                }]);

            if (insertError) throw insertError;

            // Reset state kembali ke NULL
            await supabase.from('users').update({ bot_state: null }).eq('tele_id', chatId);

            return await bot.sendMessage(chatId, 
                `✅ *Data Berhasil Dicatat*\n\n💰 Rp ${cleanNominal.toLocaleString('id-ID')}\n📝 ${keterangan}\n🏦 ${source}`, 
                { parse_mode: 'Markdown' }
            );
        }

        // Perintah lain seperti /balance
        if (text.startsWith('/balance')) {
            const { data: transactions } = await supabase
                .from('moneytrack')
                .select('tipe, nominal, source')
                .eq('username', user.username);

            let total = 0;
            transactions.forEach(tx => {
                const nom = parseInt(tx.nominal);
                tx.tipe === 'pemasukan' ? total += nom : total -= nom;
            });

            return await bot.sendMessage(chatId, `💰 *Total Saldo:* Rp ${total.toLocaleString('id-ID')}`, { parse_mode: 'Markdown' });
        }

    } catch (err) {
        console.error(err);
        await bot.sendMessage(chatId, "❌ Terjadi kesalahan sistem.");
    }

    return res.status(200).send('OK');
}
