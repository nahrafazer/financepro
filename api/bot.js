const { Telegraf, session } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');

// Variabel global agar tidak re-inisialisasi setiap request
let bot;
let supabase;

module.exports = async (req, res) => {
  // 1. Validasi Environment Variables
  const token = process.env.BOT_TOKEN;
  const sbUrl = process.env.SUPABASE_URL;
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!token || !sbUrl || !sbKey) {
    console.error("CRITICAL: Missing Environment Variables!");
    return res.status(500).send("Server Configuration Error");
  }

  // 2. Inisialisasi Bot & Supabase (Singleton Pattern)
  if (!bot) {
    bot = new Telegraf(token);
    supabase = createClient(sbUrl, sbKey);

    // Gunakan middleware session
    bot.use(session());

    // --- MIDDLEWARE AUTH ---
    const authUser = async (ctx, next) => {
      const tgId = ctx.from.id.toString();
      const { data, error } = await supabase
        .from('users')
        .select('username')
        .eq('telegram', tgId);

      if (error || !data || data.length === 0) {
        return ctx.reply("❌ Akses ditolak. ID Telegram Anda (" + tgId + ") belum terdaftar.");
      }
      ctx.state.username = data[0].username;
      return next();
    };

    // --- COMMANDS ---
    bot.start((ctx) => ctx.reply('Selamat datang di Bot MoneyTrack! Gunakan /expense atau /income untuk mencatat transaksi.'));

    bot.command(['expense', 'income'], authUser, (ctx) => {
      const tipe = ctx.message.text.includes('expense') ? 'pengeluaran' : 'pemasukan';
      ctx.session = { step: 'WAITING_NOMINAL', tipe: tipe };
      ctx.reply(`Input ${tipe.toUpperCase()} terdeteksi.\nBerapa nominalnya? (Kirim angka saja)`);
    });

    // --- TEXT HANDLING (STATE MACHINE) ---
    bot.on('text', authUser, async (ctx) => {
      const state = ctx.session;
      if (!state) return;

      if (state.step === 'WAITING_NOMINAL') {
        const nominal = parseFloat(ctx.message.text.replace(/[^0-9]/g, ''));
        if (isNaN(nominal) || nominal <= 0) return ctx.reply("Masukkan angka nominal yang valid.");
        
        ctx.session.nominal = nominal;
        ctx.session.step = 'WAITING_KETERANGAN';
        ctx.reply(`Nominal: Rp${nominal.toLocaleString('id-ID')}\nSekarang masukkan keterangannya:`);

      } else if (state.step === 'WAITING_KETERANGAN') {
        const keterangan = ctx.message.text;
        const { nominal, tipe } = ctx.session;

        const { error } = await supabase.from('moneytrack').insert([{
          username: ctx.state.username,
          tipe: tipe,
          nominal: nominal,
          keterangan: keterangan,
          tanggal: new Date().toISOString().split('T')[0]
        }]);

        if (error) {
          console.error(error);
          ctx.reply("❌ Gagal menyimpan data ke database.");
        } else {
          ctx.reply(`✅ Berhasil mencatat ${tipe}!\n💰 Rp${nominal.toLocaleString('id-ID')}\n📝 ${keterangan}`);
        }
        ctx.session = null;
      }
    });

    bot.command('total', authUser, async (ctx) => {
      const { data, error } = await supabase
        .from('moneytrack')
        .select('nominal, tipe')
        .eq('username', ctx.state.username);

      if (error) return ctx.reply("Gagal mengambil data.");
      
      const total = data.reduce((acc, curr) => {
        return curr.tipe === 'pemasukan' ? acc + Number(curr.nominal) : acc - Number(curr.nominal);
      }, 0);

      ctx.reply(`💰 Total Saldo untuk @${ctx.state.username}:\nRp${total.toLocaleString('id-ID')}`);
    });

    bot.command('today', authUser, async (ctx) => {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('moneytrack')
        .select('*')
        .eq('username', ctx.state.username)
        .eq('tanggal', today);

      if (error) return ctx.reply("Gagal mengambil data hari ini.");

      let masuk = 0; let keluar = 0;
      data.forEach(item => {
        if (item.tipe === 'pemasukan') masuk += Number(item.nominal);
        else keluar += Number(item.nominal);
      });

      ctx.reply(`📊 Laporan Hari Ini:\n📥 Masuk: Rp${masuk.toLocaleString('id-ID')}\n📤 Keluar: Rp${keluar.toLocaleString('id-ID')}`);
    });
  }

  // 3. Eksekusi Handler Webhook
  try {
    if (req.method === 'POST') {
      await bot.handleUpdate(req.body, res);
    } else {
      res.status(200).send('Bot Status: Online');
    }
  } catch (err) {
    console.error("Webhook Error:", err);
    res.status(500).send("Error");
  }
};
