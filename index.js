const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const dotenv = require('dotenv');
const axios = require('axios');
const express = require('express');

dotenv.config();

let sock = null; // biar bisa dipakai di luar startBot

// Groq AI Function
async function askGroq(prompt) {
  try {
    const res = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama3-70b-8192',
        messages: [
          {
            role: 'system',
            content: 'Kamu adalah asisten cerdas yang menjawab dengan bahasa Indonesia yang sopan dan mudah dimengerti.'
          },
          {
            role: 'user',
            content: prompt
          }
        ]
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return res.data.choices[0].message.content.trim();
  } catch (error) {
    console.error('❌ Groq API Error:', error.response?.data || error.message);
    throw new Error('Maaf, terjadi kesalahan saat menghubungi AI (Groq)');
  }
}

// WhatsApp Bot
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth');
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: true,
    auth: state,
  });

  sock.ev.on('creds.update', saveCreds);

sock.ev.on('messages.upsert', async ({ messages }) => {
  const msg = messages[0];
  if (!msg.message || msg.key.fromMe) return;

  const sender = msg.key.remoteJid;

  // ❌ Abaikan pesan dari grup
  if (sender.endsWith('@g.us')) {
    console.log(`🚫 Pesan dari grup diabaikan: ${sender}`);
    return;
  }

  const text = msg.message.conversation || msg.message.extendedTextMessage?.text;

  if (text) {
    console.log(`📩 Pertanyaan dari ${sender}: ${text}`);
    try {
      // ✅ Kirim status mengetik...
      await sock.sendPresenceUpdate('composing', sender);

      const reply = await askGroq(text);

      // ✅ Hentikan status mengetik
      await sock.sendPresenceUpdate('paused', sender);

      await sock.sendMessage(sender, { text: reply });
      console.log(`✅ Dibalas ke ${sender}`);
    } catch (err) {
      console.error('❌ Error ChatGPT:', err.message);
      await sock.sendMessage(sender, { text: err.message });
    }
  }
});

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      const reason = lastDisconnect?.error?.output?.statusCode;
      console.log('❌ Koneksi terputus. Alasan:', reason);
      if (reason !== DisconnectReason.loggedOut) {
        startBot();
      }
    } else if (connection === 'open') {
      console.log('✅ Terhubung ke WhatsApp!');
    }
  });
}

startBot();

// Express Web Server (API)
const app = express();
app.use(express.json());

// Endpoint tanya ke AI
app.post('/ask', async (req, res) => {
  const { question } = req.body;
  if (!question) {
    return res.status(400).json({ error: 'Pertanyaan tidak boleh kosong.' });
  }

  try {
    const answer = await askGroq(question);
    res.json({ question, answer });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint kirim pesan WA
app.post('/send-message', async (req, res) => {
  const { number, message } = req.body;

  if (!number || !message) {
    return res.status(400).json({ error: 'Number dan message wajib diisi.' });
  }

  try {
    const jid = number.includes('@s.whatsapp.net') ? number : `${number}@s.whatsapp.net`;
    await sock.sendMessage(jid, { text: message });
    res.json({ success: true, message: 'Pesan berhasil dikirim ke ' + number });
  } catch (err) {
    console.error('❌ Kirim pesan gagal:', err.message);
    res.status(500).json({ error: 'Gagal kirim pesan', detail: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 API berjalan di http://localhost:${PORT}`);
});
