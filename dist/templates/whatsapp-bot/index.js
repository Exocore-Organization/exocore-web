const { Client } = require('whatsapp-web.js');
const client = new Client();
client.on('qr', qr => console.log('Scan QR:', qr));
client.on('ready', () => console.log('WhatsApp ready!'));
client.on('message', m => m.body === '!ping' && m.reply('pong'));
client.initialize();
