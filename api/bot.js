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

        if (text === '/start') {
            const namaUser = user.username || "Pengguna";
            const pesanSapaan = `👋 Halo, *${namaUser}*!\n\nSelamat datang kembali di Bot MoneyTrack. Akun Anda sudah terdaftar dan siap digunakan.\n\n` +
                                `Gunakan menu berikut:\n` +
                                `📝 /catat - Catat transaksi baru\n` +
                                `💰 /balance - Cek rincian saldo\n` +
                                `📅 /today - Lihat transaksi hari ini\n` +
                                `Silahkan kunjungi https://jaknabungyuk.vercel.app`;
            
            await bot.sendMessage(chatId, pesanSapaan, { parse_mode: 'Markdown' });
            return res.status(200).send('OK');
        }

        if (text === '/cancel') {
            await supabase.from('users').update({ bot_state: null }).eq('tele_id', chatId);
            await bot.sendMessage(chatId, "🚫 Proses pencatatan dibatalkan.");
            return res.status(200).send('OK');
        }

        // --- FITUR /BALANCE (DIPISAH PER SOURCE) ---
        if (text === '/balance') {
            const { data: transactions, error } = await supabase
                .from('moneytrack')
                .select('tipe, nominal, source')
                .eq('username', user.username);

            if (error) throw error;

            const saldoPerSource = {};
            let totalKeseluruhan = 0;

            transactions.forEach(tx => {
                const src = tx.source ? tx.source.toUpperCase() : 'CASH';
                const nominal = parseInt(tx.nominal);
                
                if (!saldoPerSource[src]) saldoPerSource[src] = 0;

                if (tx.tipe.toLowerCase() === 'pemasukan') {
                    saldoPerSource[src] += nominal;
                    totalKeseluruhan += nominal;
                } else {
                    saldoPerSource[src] -= nominal;
                    totalKeseluruhan -= nominal;
                }
            });

            let msg = `💰 *RINCIAN SALDO PER SUMBER*\n\n`;
            for (const [source, saldo] of Object.entries(saldoPerSource)) {
                msg += `• *${source}*: Rp ${saldo.toLocaleString('id-ID')}\n`;
            }
            msg += `\n────────────────\n`;
            msg += `*TOTAL SEMUA:* Rp ${totalKeseluruhan.toLocaleString('id-ID')}`;

            await bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
            return res.status(200).send('OK');
        }

        if (text === '/today') {
            const { data: transactions, error } = await supabase
                .from('moneytrack')
                .select('*')
                .eq('username', user.username)
                .eq('tanggal', hariIni);

            if (error) throw error;
            if (!transactions || transactions.length === 0) {
                await bot.sendMessage(chatId, "Belum ada transaksi hari ini.");
                return res.status(200).send('OK');
            }

            let msg = `📅 *Transaksi Hari Ini*\n_${hariIni}_\n\n`;
            let masuk = 0, keluar = 0;

            transactions.forEach((tx, i) => {
                const simbol = tx.tipe.toLowerCase() === 'pemasukan' ? '➕' : '➖';
                msg += `${i + 1}. ${simbol} *Rp ${tx.nominal.toLocaleString('id-ID')}*\n   └ ${tx.keterangan} (${tx.source})\n\n`;
                tx.tipe.toLowerCase() === 'pemasukan' ? masuk += tx.nominal : keluar += tx.nominal;
            });

            msg += `────────────────\n🟢 Masuk: Rp ${masuk.toLocaleString('id-ID')}\n🔴 Keluar: Rp ${keluar.toLocaleString('id-ID')}`;
            await bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
            return res.status(200).send('OK');
        }

        if (text === '/catat') {
            await supabase.from('users').update({ bot_state: 'WAITING_INPUT' }).eq('tele_id', chatId);
            await bot.sendMessage(chatId, "Kirim data format:\n`tipe;nominal;keterangan;sumber\n\n Klik /cancel untuk batal mencatat.`", { parse_mode: 'Markdown' });
            return res.status(200).send('OK');
        }

        if (user.bot_state === 'WAITING_INPUT') {
            const parts = text.split(';');
            if (parts.length < 4) {
                await bot.sendMessage(chatId, "⚠️ Gunakan format: `tipe;nominal;keterangan;sumber` atau /cancel", { parse_mode: 'Markdown' });
                return res.status(200).send('OK');
            }

            const [tipe, nominal, keterangan, source] = parts.map(p => p.trim());
            const cleanNominal = parseInt(nominal.replace(/[^0-9]/g, ''));

            const { error: insertError } = await supabase.from('moneytrack').insert([{
                username: user.username,
                tipe: tipe.toLowerCase(),
                nominal: cleanNominal,
                keterangan: keterangan,
                source: source,
                tanggal: hariIni
            }]);

            if (insertError) throw insertError;

            await supabase.from('users').update({ bot_state: null }).eq('tele_id', chatId);
            await bot.sendMessage(chatId, `✅ Tercatat: Rp ${cleanNominal.toLocaleString('id-ID')} (${source})`);
            return res.status(200).send('OK');
        }

    } catch (err) {
        console.error(err);
        await bot.sendMessage(chatId, "❌ Terjadi kesalahan.");
    }

    return res.status(200).send('OK');
}



