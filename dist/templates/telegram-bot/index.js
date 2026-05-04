const TelegramBot = require('node-telegram-bot-api');
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });
bot.on('message', m => bot.sendMessage(m.chat.id, 'Hello from Exocore!'));
