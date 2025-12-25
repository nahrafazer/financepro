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

  try {
    if (text.toLowerCase() === '/todaydetails') {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('transaksi')
        .select('*')
        .eq('tanggal', today)
        .order('created_at', { ascending: true });

      if (error) throw error;

      if (!data || data.length === 0) {
        await kirimKeTelegram(chatId, "📭 Belum ada transaksi tercatat untuk hari ini.");
      } else {
        let listDetail = `📝 *DETAIL TRANSAKSI HARI INI*\n\n`;
        let totalMasuk = 0;
        let totalKeluar = 0;

        data.forEach((item, index) => {
          const ikon = item.tipe === 'pendapatan' ? '🟢' : '🔴';
          listDetail += `${index + 1}. ${ikon} *${item.keterangan}*\n     └ Rp ${item.nominal.toLocaleString('id-ID')}\n`;
          
          if (item.tipe === 'pendapatan') totalMasuk += Number(item.nominal);
          else totalKeluar += Number(item.nominal);
        });

        listDetail += `\n━━━━━━━━━━━━━━━\n`;
        listDetail += `💰 *Total Hari Ini: Rp ${(totalMasuk - totalKeluar).toLocaleString('id-ID')}*`;

        await kirimKeTelegram(chatId, listDetail);
      }
    }
    // FITUR A: CEK TOTAL /total
    if (text.toLowerCase() === '/total') {
      const today = new Date().toISOString().split('T')[0];
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

      const laporan = `📊 *Laporan Hari Ini*\n\n` +
                      `🟢 Masuk: Rp ${masuk.toLocaleString('id-ID')}\n` +
                      `🔴 Keluar: Rp ${keluar.toLocaleString('id-ID')}\n` +
                      `💰 *Sisa: Rp ${(masuk - keluar).toLocaleString('id-ID')}*`;

      await sendTelegram(chatId, laporan);
    } 
    
    // FITUR B: INPUT DATA (Contoh: "Makan Bakso 15000")
    else {
      const match = text.match(/(.+)\s(\d+)$/);
      if (match) {
        const keterangan = match[1];
        const nominal = parseInt(match[2]);
        const tipe = (keterangan.toLowerCase().includes('gaji') || keterangan.toLowerCase().includes('bonus')) 
                     ? 'pendapatan' : 'pengeluaran';

        const { error } = await supabase
          .from('transaksi')
          .insert([{ keterangan, nominal, tipe, tanggal: new Date().toISOString().split('T')[0] }]);

        if (error) throw error;
        await sendTelegram(chatId, `✅ *Berhasil!*\n📝 ${keterangan}\n💰 Rp ${nominal.toLocaleString('id-ID')}\n📂 ${tipe}`);
      }
    }
    return res.status(200).send('ok');
  } catch (e) {
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
