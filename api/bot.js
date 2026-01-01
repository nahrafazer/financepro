const { createClient } = require('@supabase/supabase-js');
const TelegramBot = require('node-telegram-bot-api');

const SUPABASE_URL = "https://uufpobwisjrocbyuzztx.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1ZnBvYndpc2pyb2NieXV6enR4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjY3MzEyMywiZXhwIjoyMDgyMjQ5MTIzfQ.vcKYItJ1b8g7B4cVnXmn12nr1xJso9h7pO1vjjNlO64";
const token = '8233970005:AAF5GMoEkA5Rneioq3QFuqhr1cxMhIjGMbE';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// PENTING: Matikan polling agar tidak terjadi timeout di Vercel
const bot = new TelegramBot(token, { polling: false });

export default async function handler(req, res) {
    // Vercel hanya menerima POST dari Telegram Webhook
    if (req.method !== 'POST') {
        return res.status(200).send('Bot is active');
    }

    const { message } = req.body;
    if (!message || !message.text) {
        return res.status(200).send('OK');
    }

    const chatId = message.chat.id.toString();
    const text = message.text;

    try {
        // 1. Ambil data user
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('*')
            .eq('tele_id', chatId)
            .maybeSingle();

        if (text === '/start') {
            const msg = user 
                ? `Halo ${user.username}! Gunakan /catat untuk mulai.` 
                : `Halo! ID Anda: ${chatId}. Silakan daftar di web.`;
            await bot.sendMessage(chatId, msg);
            return res.status(200).send('OK');
        }

        if (!user) {
            await bot.sendMessage(chatId, "❌ Akun belum terdaftar.");
            return res.status(200).send('OK');
        }

        // 2. Logika /catat (Triger status menunggu)
        if (text === '/catat') {
            await supabase.from('users').update({ bot_state: 'WAITING_INPUT' }).eq('tele_id', chatId);
            await bot.sendMessage(chatId, "Silakan kirim data dengan format:\n\n`tipe;nominal;keterangan;sumber`\n\nContoh:\n`pengeluaran;50000;bakso;cash`", { parse_mode: 'Markdown' });
            return res.status(200).send('OK');
        }

        // 3. Logika Menangkap Input Format tipe;nominal;keterangan;source
        if (user.bot_state === 'WAITING_INPUT') {
            const parts = text.split(';');

            if (parts.length < 4) {
                await bot.sendMessage(chatId, "⚠️ Format salah. Gunakan titik koma (;) sebagai pemisah.\nContoh: `pemasukan;100000;gaji;bank`", { parse_mode: 'Markdown' });
                return res.status(200).send('OK');
            }

            const [tipe, nominal, keterangan, source] = parts.map(p => p.trim());
            const cleanNominal = parseInt(nominal.replace(/[^0-9]/g, ''));

            if (isNaN(cleanNominal)) {
                await bot.sendMessage(chatId, "❌ Nominal harus berupa angka.");
                return res.status(200).send('OK');
            }

            // Simpan ke DB
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

            // Reset State
            await supabase.from('users').update({ bot_state: null }).eq('tele_id', chatId);
            await bot.sendMessage(chatId, `✅ Berhasil dicatat!\n💰 Rp ${cleanNominal.toLocaleString('id-ID')}\n📝 ${keterangan}`);
            return res.status(200).send('OK');
        }

        // 4. Perintah Balance
        if (text === '/balance') {
            const { data: tx } = await supabase.from('moneytrack').select('tipe, nominal').eq('username', user.username);
            let total = 0;
            tx?.forEach(t => t.tipe === 'pemasukan' ? total += t.nominal : total -= t.nominal);
            await bot.sendMessage(chatId, `💰 Saldo Total: Rp ${total.toLocaleString('id-ID')}`);
        }

    } catch (err) {
        console.error("Error context:", err);
        // Pastikan tidak mengirim response error ke Telegram berulang kali
        await bot.sendMessage(chatId, "❌ Terjadi gangguan. Coba lagi nanti.");
    }

    // Selalu kirim status 200 agar Telegram tidak mengirim ulang pesan yang sama (looping)
    return res.status(200).send('OK');
}
