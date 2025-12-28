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
        // 1. Cek User berdasarkan tele_id
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('username')
            .eq('tele_id', chatId)
            .maybeSingle();

        if (text.startsWith('/start')) {
            if (user) {
                await bot.sendMessage(chatId, `Halo, ${user.username}! 👋\n\nGunakan perintah:\n/catat [tipe] [nominal] [keterangan] [source]\n/balance - Untuk cek saldo`);
            } else {
                await bot.sendMessage(chatId, `Halo! 👋\nID Telegram Anda: ${chatId}\nSilakan daftar di web dengan ID ini.`);
            }
        } 
        
        else if (text.startsWith('/balance')) {
            if (!user) return await bot.sendMessage(chatId, "❌ Akun belum terdaftar.");

            // Ambil semua transaksi user
            const { data: transactions, error: txError } = await supabase
                .from('moneytrack')
                .select('tipe, nominal, source')
                .eq('username', user.username);

            if (txError) throw txError;

            if (!transactions || transactions.length === 0) {
                return await bot.sendMessage(chatId, "Belum ada riwayat transaksi.");
            }

            // Hitung saldo per source
            const balancePerSource = {};
            let totalSemua = 0;

            transactions.forEach(tx => {
                const source = tx.source || 'Cash';
                const nominal = parseInt(tx.nominal);
                if (!balancePerSource[source]) balancePerSource[source] = 0;

                if (tx.tipe === 'pemasukan') {
                    balancePerSource[source] += nominal;
                    totalSemua += nominal;
                } else {
                    balancePerSource[source] -= nominal;
                    totalSemua -= nominal;
                }
            });

            // Susun pesan balasan
            let responseMsg = `💰 *Rincian Saldo ${user.username}* 💰\n\n`;
            for (const [src, bal] of Object.entries(balancePerSource)) {
                responseMsg += `• *${src}*: Rp ${bal.toLocaleString('id-ID')}\n`;
            }
            responseMsg += `\n────────────────\n*TOTAL SALDO:* Rp ${totalSemua.toLocaleString('id-ID')}`;

            await bot.sendMessage(chatId, responseMsg, { parse_mode: 'Markdown' });
        }

        else if (text.startsWith('/catat')) {
            if (!user) return await bot.sendMessage(chatId, "❌ Akun belum terdaftar.");
            
            const parts = text.split(' ');
            if (parts.length < 4) {
                return await bot.sendMessage(chatId, "⚠️ Format: /catat [tipe] [nominal] [keterangan] [sumber]");
            }

            const [_, tipe, nominal, keterangan, source] = parts;
            const { error: insertError } = await supabase
                .from('moneytrack')
                .insert([{
                    username: user.username,
                    tipe: tipe.toLowerCase(),
                    nominal: parseInt(nominal),
                    keterangan: keterangan,
                    source: source || 'Cash',
                    tanggal: new Date().toISOString().split('T')[0]
                }]);

            if (insertError) throw insertError;
            await bot.sendMessage(chatId, `✅ Berhasil mencatat ${tipe} Rp ${parseInt(nominal).toLocaleString('id-ID')}`);
        }

    } catch (err) {
        console.error(err);
        await bot.sendMessage(chatId, "❌ Terjadi kesalahan pada sistem.");
    }

    return res.status(200).send('OK');
}
