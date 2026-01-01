const { createClient } = require('@supabase/supabase-js');
const TelegramBot = require('node-telegram-bot-api');

// Konfigurasi Hardcoded
const SUPABASE_URL = "https://uufpobwisjrocbyuzztx.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1ZnBvYndpc2pyb2NieXV6enR4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjY3MzEyMywiZXhwIjoyMDgyMjQ5MTIzfQ.vcKYItJ1b8g7B4cVnXmn12nr1xJso9h7pO1vjjNlO64";
const token = '8233970005:AAF5GMoEkA5Rneioq3QFuqhr1cxMhIjGMbE';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const bot = new TelegramBot(token, { polling: false });

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(200).send('Bot is active');

    const { message } = req.body;
    if (!message || !message.text) return res.status(200).send('OK');

    const chatId = message.chat.id.toString();
    const text = message.text;
    const hariIni = new Date().toISOString().split('T')[0];

    try {
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('*')
            .eq('tele_id', chatId)
            .maybeSingle();

        if (!user) {
            if (text === '/start') {
                await bot.sendMessage(chatId, `Halo! ID Telegram Anda: ${chatId}\nSilakan daftar di web.`);
            } else {
                await bot.sendMessage(chatId, "❌ Akun belum terdaftar.");
            }
            return res.status(200).send('OK');
        }

        // --- FITUR /CANCEL (MEMBATALKAN PROSES INPUT) ---
        if (text === '/cancel') {
            await supabase.from('users').update({ bot_state: null }).eq('tele_id', chatId);
            await bot.sendMessage(chatId, "🚫 Proses pencatatan dibatalkan.");
            return res.status(200).send('OK');
        }

        // --- FITUR /BALANCE (TOTAL KESELURUHAN) ---
        if (text === '/balance') {
            const { data: transactions, error } = await supabase
                .from('moneytrack')
                .select('tipe, nominal')
                .eq('username', user.username);

            if (error) throw error;

            let totalSaldo = 0;
            transactions.forEach(tx => {
                if (tx.tipe.toLowerCase() === 'pemasukan') totalSaldo += tx.nominal;
                else totalSaldo -= tx.nominal;
            });

            await bot.sendMessage(chatId, `💰 *TOTAL SALDO KESELURUHAN*\n\n========= \n*Rp ${totalSaldo.toLocaleString('id-ID')}* \n=========`, { parse_mode: 'Markdown' });
            return res.status(200).send('OK');
        }

        // --- FITUR /TODAY (RINCIAN HARI INI) ---
        if (text === '/today') {
            const { data: transactions, error } = await supabase
                .from('moneytrack')
                .select('*')
                .eq('username', user.username)
                .eq('tanggal', hariIni);

            if (error) throw error;

            if (!transactions || transactions.length === 0) {
                await bot.sendMessage(chatId, "Belum ada transaksi untuk hari ini.");
                return res.status(200).send('OK');
            }

            let msg = `📅 *Rincian Transaksi Hari Ini*\n_${hariIni}_\n\n`;
            let totalMasuk = 0;
            let totalKeluar = 0;

            transactions.forEach((tx, i) => {
                const simbol = tx.tipe.toLowerCase() === 'pemasukan' ? '🟢' : '🔴';
                msg += `${i + 1}. ${simbol} *Rp ${tx.nominal.toLocaleString('id-ID')}*\n   └ ${tx.keterangan} (${tx.source})\n\n`;
                
                if (tx.tipe.toLowerCase() === 'pemasukan') totalMasuk += tx.nominal;
                else totalKeluar += tx.nominal;
            });

            msg += `────────────────\n`;
            msg += `🟢 Masuk: Rp ${totalMasuk.toLocaleString('id-ID')}\n`;
            msg += `🔴 Keluar: Rp ${totalKeluar.toLocaleString('id-ID')}\n`;
            msg += `📊 Selisih: Rp ${(totalMasuk - totalKeluar).toLocaleString('id-ID')}`;

            await bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
            return res.status(200).send('OK');
        }

        // --- FITUR /CATAT ---
        if (text === '/catat') {
            await supabase.from('users').update({ bot_state: 'WAITING_INPUT' }).eq('tele_id', chatId);
            await bot.sendMessage(chatId, "Kirim data dengan format:\n\n`tipe;nominal;keterangan;sumber`\n\nContoh:\n`pengeluaran;25000;makan siang;cash` \n\nAtau ketik /cancel untuk membatalkan.", { parse_mode: 'Markdown' });
            return res.status(200).send('OK');
        }

        // --- PROSES INPUT DATA ---
        if (user.bot_state === 'WAITING_INPUT') {
            const parts = text.split(';');
            if (parts.length < 4) {
                await bot.sendMessage(chatId, "⚠️ Format salah! Gunakan pemisah titik koma.\nContoh: `pengeluaran;5000;parkir;cash` \n\nKetik /cancel jika ingin membatalkan.", { parse_mode: 'Markdown' });
                return res.status(200).send('OK');
            }

            const [tipe, nominal, keterangan, source] = parts.map(p => p.trim());
            const cleanNominal = parseInt(nominal.replace(/[^0-9]/g, ''));

            if (isNaN(cleanNominal)) {
                await bot.sendMessage(chatId, "❌ Nominal harus berupa angka.");
                return res.status(200).send('OK');
            }

            const { error: insertError } = await supabase
                .from('moneytrack')
                .insert([{
                    username: user.username,
                    tipe: tipe.toLowerCase(),
                    nominal: cleanNominal,
                    keterangan: keterangan,
                    source: source,
                    tanggal: hariIni
                }]);

            if (insertError) throw insertError;

            // Reset state setelah sukses
            await supabase.from('users').update({ bot_state: null }).eq('tele_id', chatId);
            await bot.sendMessage(chatId, `✅ *Berhasil Dicatat!*\n\n💰 Rp ${cleanNominal.toLocaleString('id-ID')}\n📝 ${keterangan}\n🏦 ${source}`, { parse_mode: 'Markdown' });
            return res.status(200).send('OK');
        }

    } catch (err) {
        console.error(err);
        await bot.sendMessage(chatId, "❌ Terjadi kesalahan pada sistem.");
    }

    return res.status(200).send('OK');
}

