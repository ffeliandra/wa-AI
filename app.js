const express = require('express');
const dotenv = require('dotenv');
const messageQueue = require('./queue');

dotenv.config();
const app = express();
app.use(express.json());

app.post('/send', async (req, res) => {
  const { participants, link } = req.body;
  if (!participants || !link) return res.status(400).json({ error: 'Data tidak lengkap!' });

  for (const p of participants) {
    messageQueue.add(
      {
        number: p.number,
        name: p.name || 'Peserta',
        link,
      },
      { delay: 1000 } // 1 detik delay antar pesan
    );
  }

  res.json({ status: 'Pesan akan dikirim bertahap', total: participants.length });
});

app.listen(process.env.PORT, () => {
  console.log(`🚀 API aktif di http://localhost:${process.env.PORT}/send`);
});
