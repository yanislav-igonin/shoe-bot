import { config } from './config';
import { getCompletion } from './openai';
import { Bot } from 'grammy';

const bot = new Bot(config.botToken);

// я, Серега и Марк
const allowedUsers = [142_166_671, 383_288_860, 546_166_718];

bot.command('start', async (context) => {
  await context.reply(
    'Привет, я Ботинок.' +
      '\nГенерирую текст по запросу и отвечаю на любые вопросы.' +
      '\nНапиши мне что-нибудь, и я попробую ответить.' +
      '\n\nТакже работую в группах.' +
      '\n\nЗапрос производится так: "Ботинок, <текст>"',
  );
});

bot.command('help', async (context) => {
  await context.reply('Запрос производится так: "Ботинок, <текст>"');
});

bot.on('message:text', async (context) => {
  const { text } = context.message;
  const fromId = context.message.from.id;

  const notRightText = !(
    text.startsWith('Ботинок,') || text.startsWith('ботинок,')
  );
  if (notRightText) {
    return;
  }

  // Disable bot for other users for now
  const notRightUser = !allowedUsers.includes(fromId);
  if (notRightUser) {
    await context.reply('Пока доступно только Яну');
    return;
  }

  const rest = text.replace('Ботинок,', '').replace('ботинок,', '');

  try {
    const completition = await getCompletion(rest);
    const fromMessageId = context.message.message_id;
    await context.reply(completition ?? 'LOL', {
      reply_to_message_id: fromMessageId,
    });
  } catch (error) {
    await context.reply('Что-то пошло не так');
    throw error;
  }
});

// eslint-disable-next-line no-console
bot.catch(console.error);

// eslint-disable-next-line no-console
bot.start().catch(console.error);
