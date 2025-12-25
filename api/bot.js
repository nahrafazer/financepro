import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('Bot Active');

  const { message } = req.body;
  if (!message || !message.text) return res.status(200).send('ok');

  const chatId = message.chat.id;
  const text = message.text.trim();

  // Helper untuk mendapatkan tanggal hari ini format YYYY-MM-DD (WIB)
  const getTodayDate = () => {
    const date = new Date();
    date.setHours(date.getHours() + 7); // Penyesuaian ke WIB (UTC+7)
    return date.toISOString().split('T')[0];
  };

  try {
    const today = getTodayDate();

    // 1. FITUR: CEK TOTAL (/total)
    if (text.toLowerCase() === '/total') {
      const { data, error } = await supabase
        .from('transaksi')
        .select('tipe, nominal')
        .eq('tanggal', today);

      if (error) throw error;

      let masuk = 0, keluar = 0;
      data.forEach(item => {
        if (item.tipe === 'pendapatan') masuk += Number(item.nominal);
        else keluar += Number(item.nominal);
      });

      const laporan = `📊 *LAPORAN HARI INI*\n` +
                      `📅 _${today}_\n\n` +
                      `🟢 Masuk: Rp ${masuk.toLocaleString('id-ID')}\n` +
                      `🔴 Keluar: Rp ${keluar.toLocaleString('id-ID')}\n` +
                      `━━━━━━━━━━━━━━━\n` +
                      `💰 *Sisa: Rp ${(masuk - keluar).toLocaleString('id-ID')}*`;

      await sendTelegram(chatId, laporan);
    } 

    // 2. FITUR BARU: DETAIL TRANSAKSI (/todaydetails)
    else if (text.toLowerCase() === '/todaydetails') {
      const { data, error } = await supabase
        .from('transaksi')
        .select('*')
        .eq('tanggal', today)
        .order('created_at', { ascending: true });

      if (error) throw error;

      if (!data || data.length === 0) {
        await sendTelegram(chatId, "📭 Belum ada transaksi tercatat hari ini.");
      } else {
        let listDetail = `📝 *DETAIL TRANSAKSI HARI INI*\n\n`;
        let total = 0;

        data.forEach((item, index) => {
          const ikon = item.tipe === 'pendapatan' ? '🟢' : '🔴';
          const nominal = Number(item.nominal);
          listDetail += `${index + 1}. ${ikon} *${item.keterangan}*\n     └ Rp ${nominal.toLocaleString('id-ID')}\n`;
          
          total += (item.tipe === 'pendapatan' ? nominal : -nominal);
        });

        listDetail += `\n━━━━━━━━━━━━━━━\n`;
        listDetail += `💰 *Saldo Akhir: Rp ${total.toLocaleString('id-ID')}*`;

        await sendTelegram(chatId, listDetail);
      }
    }
    
    // 3. FITUR: INPUT DATA OTOMATIS (Contoh: "Makan Bakso 15000")
    else {
      const match = text.match(/(.+)\s(\d+)$/);
      if (match) {
        const keterangan = match[1];
        const nominal = parseInt(match[2]);
        const tipe = /(gaji|bonus|masuk|pemasukan|income)/i.test(keterangan) 
                     ? 'pendapatan' : 'pengeluaran';

        const { error } = await supabase
          .from('transaksi')
          .insert([{ 
            keterangan, 
            nominal, 
            tipe, 
            tanggal: today 
          }]);

        if (error) throw error;
        await sendTelegram(chatId, `✅ *Berhasil Dicatat!*\n\n📝 ${keterangan}\n💰 Rp ${nominal.toLocaleString('id-ID')}\n📂 ${tipe}`);
      }
    }

    return res.status(200).send('ok');
  } catch (e) {
    console.error(e);
    await sendTelegram(chatId, "⚠️ Terjadi kesalahan: " + e.message);
    return res.status(200).send('error');
  }
}

async function sendTelegram(chatId, text) {
  await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })
  });
}
