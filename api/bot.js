const { Telegraf, session } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');

// Inisialisasi Supabase di luar handler agar re-usable
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async (req, res) => {
  const token = process.env.BOT_TOKEN;
  if (!token) return res.status(500).send("BOT_TOKEN missing");

  const bot = new Telegraf(token);

  // Menggunakan memory session (standar untuk serverless sederhana)
  bot.use(session());

  // --- MIDDLEWARE AUTH ---
  const authUser = async (ctx, next) => {
    const tgId = ctx.from.id.toString();
    const { data, error } = await supabase
      .from('users')
      .select('username')
      .eq('telegram', tgId);

    if (error || !data || data.length === 0) {
      return ctx.reply("❌ Akses ditolak. ID " + tgId + " tidak terdaftar.");
    }
    ctx.state.username = data[0].username;
    return next();
  };

  // --- COMMANDS ---
  bot.start((ctx) => ctx.reply('Halo! Gunakan /expense atau /income untuk mencatat keuangan.'));

  bot.command(['expense', 'income'], authUser, (ctx) => {
    const tipe = ctx.message.text.includes('expense') ? 'pengeluaran' : 'pemasukan';
    ctx.session = { step: 'WAITING_NOMINAL', tipe: tipe };
    ctx.reply(`Input ${tipe.toUpperCase()}.\nBerapa nominalnya? (Angka saja)`);
  });

  bot.command('total', authUser, async (ctx) => {
    const { data, error } = await supabase
      .from('moneytrack')
      .select('nominal, tipe')
      .eq('username', ctx.state.username);

    if (error) return ctx.reply("Gagal mengambil data.");
    const total = data.reduce((acc, curr) => 
      curr.tipe === 'pemasukan' ? acc + Number(curr.nominal) : acc - Number(curr.nominal), 0);
    ctx.reply(`💰 Total Saldo @${ctx.state.username}: Rp${total.toLocaleString('id-ID')}`);
  });

  bot.command('today', authUser, async (ctx) => {
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('moneytrack')
      .select('*')
      .eq('username', ctx.state.username)
      .eq('tanggal', today);

    if (error) return ctx.reply("Gagal mengambil data.");
    let masuk = 0, keluar = 0;
    data.forEach(i => i.tipe === 'pemasukan' ? masuk += Number(i.nominal) : keluar += Number(i.nominal));
    ctx.reply(`📊 Laporan Hari Ini:\n📥 Masuk: Rp${masuk.toLocaleString('id-ID')}\n📤 Keluar: Rp${keluar.toLocaleString('id-ID')}`);
  });

  // --- INPUT HANDLING ---
  bot.on('text', authUser, async (ctx) => {
    const state = ctx.session;
    if (!state) return;

    if (state.step === 'WAITING_NOMINAL') {
      const nominal = parseFloat(ctx.message.text.replace(/[^0-9]/g, ''));
      if (isNaN(nominal)) return ctx.reply("Masukkan angka valid.");
      ctx.session.nominal = nominal;
      ctx.session.step = 'WAITING_KETERANGAN';
      ctx.reply("Masukkan keterangan:");
    } 
    else if (state.step === 'WAITING_KETERANGAN') {
      const { error } = await supabase.from('moneytrack').insert([{
        username: ctx.state.username,
        tipe: state.tipe,
        nominal: state.nominal,
        keterangan: ctx.message.text,
        tanggal: new Date().toISOString().split('T')[0]
      }]);

      if (error) ctx.reply("❌ Gagal menyimpan.");
      else ctx.reply(`✅ Tersimpan: Rp${state.nominal.toLocaleString('id-ID')} (${state.tipe})`);
      ctx.session = null;
    }
  });

  // --- EXECUTION ---
  try {
    await bot.handleUpdate(req.body, res);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error");
  }
};
