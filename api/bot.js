const { Telegraf, session } = require('telegraf');
const { Client } = require('pg');

// Gunakan Environment Variables
const bot = new Telegraf(process.env.BOT_TOKEN);

// Konfigurasi Database dari Environment Variables
const dbConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Diperlukan untuk hosting seperti Supabase/Neon
};

bot.use(session());

// Middleware Auth
const authUser = async (ctx, next) => {
    const tgId = ctx.from.id.toString();
    const db = new Client(dbConfig);
    try {
        await db.connect();
        const res = await db.query('SELECT username FROM public.users WHERE telegram = $1', [tgId]);
        if (res.rows.length === 0) return ctx.reply("❌ ID Telegram tidak terdaftar.");
        ctx.state.username = res.rows[0].username;
        await db.end();
        return next();
    } catch (err) {
        if (db) await db.end();
        return ctx.reply("DB Error.");
    }
};

// --- Logika Command (sama seperti sebelumnya) ---
bot.command(['expense', 'income'], authUser, (ctx) => {
    const type = ctx.message.text.includes('expense') ? 'pengeluaran' : 'pemasukan';
    ctx.session = { step: 'WAITING_NOMINAL', type: type };
    ctx.reply(`Masukkan nominal ${type}:`);
});

bot.on('text', authUser, async (ctx) => {
    const state = ctx.session;
    if (!state) return;

    const db = new Client(dbConfig);
    try {
        await db.connect();
        if (state.step === 'WAITING_NOMINAL') {
            const nominal = parseFloat(ctx.message.text.replace(/[^0-9]/g, ''));
            if (isNaN(nominal)) return ctx.reply("Masukkan angka valid.");
            ctx.session.nominal = nominal;
            ctx.session.step = 'WAITING_KETERANGAN';
            ctx.reply("Masukkan keterangan:");
        } else if (state.step === 'WAITING_KETERANGAN') {
            await db.query(
                `INSERT INTO moneytrack (username, tipe, nominal, keterangan, tanggal) 
                 VALUES ($1, $2, $3, $4, CURRENT_DATE)`,
                [ctx.state.username, state.type, state.nominal, ctx.message.text]
            );
            ctx.reply("✅ Data tersimpan.");
            ctx.session = null;
        }
    } catch (err) {
        console.error(err);
    } finally {
        await db.end();
    }
});

// EXPORT UNTUK VERCEL (WEBHOOK)
module.exports = async (req, res) => {
    try {
        await bot.handleUpdate(req.body, res);
    } catch (err) {
        console.error(err);
        res.status(500).send('Error');
    }
};