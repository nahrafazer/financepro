const { createClient } = require('@supabase/supabase-js');
const TelegramBot = require('node-telegram-bot-api');

// Konfigurasi Hardcoded
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
        // 1. Ambil User & State dari Database
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('*')
            .eq('tele_id', chatId)
            .maybeSingle();

        // Cek jika perintah adalah /start
        if (text.startsWith('/start')) {
            if (user) {
                return await bot.sendMessage(chatId, `Halo, ${user.username}! 👋\n\nGunakan perintah:\n/catat - Mulai mencatat transaksi\n/balance - Cek saldo`);
            } else {
                return await bot.sendMessage(chatId, `Halo! 👋\nID Telegram Anda: ${chatId}\nSilakan daftar di web dengan ID ini.`);
            }
        }

        if (!user) return await bot.sendMessage(chatId, "❌ Akun belum terdaftar.");

        // --- LOGIKA TANYA JAWAB (STATE MACHINE) ---

        // Jika user mengetik /catat, kita mulai dari awal (Tanya Tipe)
        if (text.startsWith('/catat')) {
            await updateState(chatId, 'WAITING_TIPE', {});
            return await bot.sendMessage(chatId, "Pilih tipe transaksi:", {
                reply_markup: {
                    keyboard: [[{ text: 'Pemasukan' }, { text: 'Pengeluaran' }]],
                    one_time_keyboard: true,
                    resize_keyboard: true
                }
            });
        }

        // Cek status percakapan terakhir user
        const state = user.bot_state;

        switch (state) {
            case 'WAITING_TIPE':
                const tipe = text.toLowerCase();
                if (tipe !== 'pemasukan' && tipe !== 'pengeluaran') {
                    return await bot.sendMessage(chatId, "Mohon pilih 'Pemasukan' atau 'Pengeluaran' pada tombol di bawah.");
                }
                await updateState(chatId, 'WAITING_NOMINAL', { tipe });
                return await bot.sendMessage(chatId, `Anda memilih ${tipe}. \n\nSekarang, berapa *Nominalnya*? (Contoh: 50000)`, { parse_mode: 'Markdown' });

            case 'WAITING_NOMINAL':
                const nominal = parseInt(text.replace(/[^0-9]/g, ''));
                if (isNaN(nominal)) return await bot.sendMessage(chatId, "❌ Masukkan angka nominal yang valid tanpa titik/koma.");
                
                await updateState(chatId, 'WAITING_KETERANGAN', { ...user.temp_data, nominal });
                return await bot.sendMessage(chatId, "Apa *Keterangannya*? (Contoh: Beli nasi goreng)", { parse_mode: 'Markdown' });

            case 'WAITING_KETERANGAN':
                await updateState(chatId, 'WAITING_SOURCE', { ...user.temp_data, keterangan: text });
                return await bot.sendMessage(chatId, "Dari mana *Sumber Dananya*? (Contoh: Cash, Bank, atau ShopeePay)", {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        keyboard: [[{ text: 'Cash' }, { text: 'Bank' }], [{ text: 'E-Wallet' }]],
                        one_time_keyboard: true,
                        resize_keyboard: true
                    }
                });

            case 'WAITING_SOURCE':
                const dataSimpan = { ...user.temp_data, source: text };

                // Simpan ke Database (Tabel moneytrack)
                const { error: insertError } = await supabase
                    .from('moneytrack')
                    .insert([{
                        username: user.username,
                        tipe: dataSimpan.tipe,
                        nominal: dataSimpan.nominal,
                        keterangan: dataSimpan.keterangan,
                        source: dataSimpan.source,
                        tanggal: new Date().toISOString().split('T')[0]
                    }]);

                if (insertError) throw insertError;

                // Reset State di tabel user agar kembali normal
                await updateState(chatId, null, null);

                let recap = `✅ *Transaksi Berhasil Dicatat!*\n\n`;
                recap += ` Jenis: ${dataSimpan.tipe.toUpperCase()}\n`;
                recap += ` Nominal: Rp ${dataSimpan.nominal.toLocaleString('id-ID')}\n`;
                recap += ` Ket: ${dataSimpan.keterangan}\n`;
                recap += ` Sumber: ${dataSimpan.source}`;

                return await bot.sendMessage(chatId, recap, { parse_mode: 'Markdown' });

            default:
                // Jika tidak dalam proses tanya jawab, cek perintah lain
                if (text.startsWith('/balance')) {
                    return await handleBalance(chatId, user);
                }
                return await bot.sendMessage(chatId, "Gunakan /catat untuk mulai mencatat atau /balance untuk cek saldo.");
        }

    } catch (err) {
        console.error(err);
        return await bot.sendMessage(chatId, "❌ Terjadi kesalahan pada sistem. Pastikan struktur tabel database sesuai.");
    }

    return res.status(200).send('OK');
}

// Fungsi bantu untuk Update State di Supabase
async function updateState(teleId, state, data) {
    await supabase
        .from('users')
        .update({ bot_state: state, temp_data: data })
        .eq('tele_id', teleId);
}

// Fungsi bantu untuk Balance
async function handleBalance(chatId, user) {
    const { data: transactions, error } = await supabase
        .from('moneytrack')
        .select('tipe, nominal, source')
        .eq('username', user.username);

    if (error || !transactions) return bot.sendMessage(chatId, "Gagal mengambil data saldo.");

    const balances = {};
    let total = 0;

    transactions.forEach(tx => {
        const src = tx.source || 'Cash';
        const nom = parseInt(tx.nominal);
        if (!balances[src]) balances[src] = 0;
        
        if (tx.tipe === 'pemasukan') {
            balances[src] += nom;
            total += nom;
        } else {
            balances[src] -= nom;
            total -= nom;
        }
    });

    let msg = `💰 *Saldo Anda (${user.username})*\n\n`;
    for (const [s, b] of Object.entries(balances)) {
        msg += `• ${s}: Rp ${b.toLocaleString('id-ID')}\n`;
    }
    msg += `\n──────────────\n*TOTAL:* Rp ${total.toLocaleString('id-ID')}`;
    
    return await bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
}
