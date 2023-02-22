/* eslint-disable require-unicode-regexp */
import { config } from './config';
import { getCompletion } from './openai';
import { Bot } from 'grammy';

const bot = new Bot(config.botToken);

bot.on('message:text', async (context) => {
  const { text } = context.message;
  const fromId = context.message.from.id;

  // Disable bot for other users for now
  const notRightUser = fromId !== 142_166_671;
  if (notRightUser) {
    await context.reply('Пока доступно только Яну');
    return;
  }

  const notRightText =
    text.startsWith('Ботинок,') || text.startsWith('ботинок,');
  if (notRightText) {
    return;
  }

  const rest = text.replace('Ботинок,', '').replace('ботинок,', '');

  try {
    const completition = await getCompletion(rest);
    await context.reply(completition ?? 'LOL');
  } catch (error) {
    await context.reply('Что-то пошло не так');
    throw error;
  }
});

// eslint-disable-next-line no-console
bot.catch(console.error);

// eslint-disable-next-line no-console
bot.start().catch(console.error);
