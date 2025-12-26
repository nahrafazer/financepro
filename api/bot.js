const { Telegraf } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(200).send('Bot is ready!');

  const bot = new Telegraf(process.env.BOT_TOKEN);

  // Helper untuk cek User
  const getUsername = async (tgId) => {
    const { data } = await supabase.from('users').select('username').eq('telegram', tgId.toString()).single();
    return data ? data.username : null;
  };

  bot.start((ctx) => ctx.reply('Bot Aktif! 🚀\n\nCara pakai:\n/expense [angka] [keterangan]\n/income [angka] [keterangan]\n/total\n/today'));

  // Handler /expense & /income
  bot.command(['expense', 'income'], async (ctx) => {
    const username = await getUsername(ctx.from.id);
    if (!username) return ctx.reply("❌ ID Telegram Anda belum terdaftar di database.");

    const args = ctx.message.text.split(' ');
    if (args.length < 3) return ctx.reply("Format salah! Contoh: /expense 50000 makan siang");

    const tipe = ctx.message.text.includes('expense') ? 'pengeluaran' : 'pemasukan';
    const nominal = parseFloat(args[1].replace(/[^0-9]/g, ''));
    const keterangan = args.slice(2).join(' ');

    const { error } = await supabase.from('moneytrack').insert([
      { 
        username: username, 
        tipe: tipe, 
        nominal: nominal, 
        keterangan: keterangan, 
        tanggal: new Date().toISOString().split('T')[0] 
      }
    ]);

    if (error) return ctx.reply("❌ Gagal menyimpan ke database.");
    ctx.reply(`✅ Berhasil mencatat ${tipe}:\n💰 Rp${nominal.toLocaleString('id-ID')}\n📝 ${keterangan}`);
  });

  // Handler /total
  bot.command('total', async (ctx) => {
    const username = await getUsername(ctx.from.id);
    if (!username) return;

    const { data } = await supabase.from('moneytrack').select('nominal, tipe').eq('username', username);
    const total = data.reduce((acc, curr) => curr.tipe === 'pemasukan' ? acc + Number(curr.nominal) : acc - Number(curr.nominal), 0);
    
    ctx.reply(`💰 Total Saldo @${username}:\nRp${total.toLocaleString('id-ID')}`);
  });

  try {
    await bot.handleUpdate(req.body);
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(200).send('OK');
  }
};
