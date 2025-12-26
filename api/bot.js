const { Telegraf, session } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');

// Inisialisasi Supabase menggunakan URL dan Key
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const bot = new Telegraf(process.env.BOT_TOKEN);
bot.use(session());

// Middleware Auth menggunakan Supabase API
const authUser = async (ctx, next) => {
  const tgId = ctx.from.id.toString();
  
  const { data, error } = await supabase
    .from('users')
    .select('username')
    .eq('telegram', tgId)
    .single();

  if (error || !data) {
    return ctx.reply("❌ ID Telegram tidak terdaftar.");
  }

  ctx.state.username = data.username;
  return next();
};

// Command /expense & /income
bot.command(['expense', 'income'], authUser, (ctx) => {
  const tipe = ctx.message.text.includes('expense') ? 'pengeluaran' : 'pemasukan';
  ctx.session = { step: 'WAITING_NOMINAL', tipe: tipe };
  ctx.reply(`Masukkan nominal ${tipe}:`);
});

// Handle Input
bot.on('text', authUser, async (ctx) => {
  const state = ctx.session;
  if (!state) return;

  if (state.step === 'WAITING_NOMINAL') {
    const nominal = parseFloat(ctx.message.text.replace(/[^0-9]/g, ''));
    if (isNaN(nominal)) return ctx.reply("Masukkan angka saja.");
    ctx.session.nominal = nominal;
    ctx.session.step = 'WAITING_KETERANGAN';
    ctx.reply("Masukkan keterangan:");
  } 
  else if (state.step === 'WAITING_KETERANGAN') {
    const { error } = await supabase
      .from('moneytrack')
      .insert([
        { 
          username: ctx.state.username, 
          tipe: state.tipe, 
          nominal: state.nominal, 
          keterangan: ctx.message.text,
          tanggal: new Date().toISOString().split('T')[0] // Format YYYY-MM-DD
        }
      ]);

    if (error) {
      console.error(error);
      ctx.reply("❌ Gagal menyimpan data.");
    } else {
      ctx.reply(`✅ Berhasil mencatat ${state.tipe} Rp${state.nominal.toLocaleString('id-ID')}`);
    }
    ctx.session = null;
  }
});

// Command /total & /today (Contoh logika ringkas)
bot.command('total', authUser, async (ctx) => {
  const { data, error } = await supabase
    .from('moneytrack')
    .select('nominal, tipe')
    .eq('username', ctx.state.username);

  if (error) return ctx.reply("Gagal mengambil data.");

  const total = data.reduce((acc, curr) => {
    return curr.tipe === 'pemasukan' ? acc + Number(curr.nominal) : acc - Number(curr.nominal);
  }, 0);

  ctx.reply(`💰 Total Saldo: Rp${total.toLocaleString('id-ID')}`);
});

module.exports = async (req, res) => {
  await bot.handleUpdate(req.body, res);
};
