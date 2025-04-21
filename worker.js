const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const messageQueue = require('./queue');

let sock;

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth');
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    auth: state,
    printQRInTerminal: true,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'close') {
      const reason = lastDisconnect?.error?.output?.statusCode;
      console.log('❌ Terputus. Alasan:', reason);

      if (reason !== DisconnectReason.loggedOut) {
        startBot(); // reconnect otomatis
      }
    } else if (connection === 'open') {
      console.log('✅ Terhubung ke WhatsApp!');
    }
  });

  // 🚨 Hanya di sini kamu panggil .process()
  messageQueue.process(async (job) => {
    const { number, message } = job.data;
    const jid = number.includes('@s.whatsapp.net') ? number : `${number}@s.whatsapp.net`;

    try {
      await sock.sendMessage(jid, { text: message });
      console.log(`✅ Terkirim ke ${number}`);
      return Promise.resolve();
    } catch (err) {
      console.error(`❌ Gagal kirim ke ${number}:`, err.message);
      return Promise.reject(err);
    }
  });
}

startBot();
