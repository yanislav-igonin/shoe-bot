import { Bot } from 'grammy';

// eslint-disable-next-line node/no-process-env
const bot = new Bot(process.env.BOT_TOKEN ?? '');

bot.on(
  'message:text',
  async (context) => await context.reply('Echo: ' + context.message.text),
);

// eslint-disable-next-line no-console
bot.start().catch(console.error);
