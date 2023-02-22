import { config } from './config';
import { getCompletion } from './openai';
import { replies } from './replies';
import { Bot } from 'grammy';

const bot = new Bot(config.botToken);

// я, Серега и Марк
const allowedUsers = [142_166_671, 383_288_860, 546_166_718];

bot.command('start', async (context) => {
  await context.reply(replies.start);
});

bot.command('help', async (context) => {
  await context.reply(replies.help);
});

const shouldBeIgnored = (text: string) =>
  !(text.startsWith('Ботинок,') || text.startsWith('ботинок,'));

const getRest = (text: string) => {
  if (text.startsWith('Ботинок,')) {
    return text.replace('Ботинок,', '');
  }

  if (text.startsWith('ботинок,')) {
    return text.replace('ботинок,', '');
  }

  return text;
};

bot.on('message:text', async (context) => {
  const { text } = context.message;
  const fromId = context.message.from.id;

  const notRightText = shouldBeIgnored(text);
  if (notRightText) {
    return;
  }

  // Disable bot for other users for now
  const notRightUser = !allowedUsers.includes(fromId);
  if (notRightUser) {
    await context.reply(replies.notAllowed);
    return;
  }

  const rest = getRest(text);

  try {
    const completition = await getCompletion(rest);
    const fromMessageId = context.message.message_id;
    await context.reply(completition ?? 'LOL', {
      reply_to_message_id: fromMessageId,
    });
  } catch (error) {
    await context.reply(replies.error);
    throw error;
  }
});

// eslint-disable-next-line no-console
bot.catch(console.error);

// eslint-disable-next-line no-console
bot.start().catch(console.error);
