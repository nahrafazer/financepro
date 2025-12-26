const { Telegraf } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async (req, res) => {
  try {
    const token = process.env.BOT_TOKEN;
    if (!token) throw new Error("BOT_TOKEN is missing");

    const bot = new Telegraf(token);

    // Perintah Paling Dasar (Tanpa Database)
    bot.command('ping', (ctx) => ctx.reply('Pong! Bot Berhasil Merespons.'));

    // Perintah Start dengan Cek Database
    bot.start(async (ctx) => {
      const tgId = ctx.from.id.toString();
      const { data } = await supabase.from('users').select('username').eq('telegram', tgId);
      
      if (data && data.length > 0) {
        ctx.reply(`Halo ${data[0].username}! Bot sudah terhubung ke database.`);
      } else {
        ctx.reply(`ID Telegram ${tgId} belum terdaftar di database.`);
      }
    });

    // Handle Update dari Telegram
    if (req.method === 'POST') {
      await bot.handleUpdate(req.body);
      res.status(200).send('OK');
    } else {
      res.status(200).send('Bot is running...');
    }
  } catch (error) {
    console.error("Error utama:", error.message);
    res.status(500).send(error.message);
  }
};
