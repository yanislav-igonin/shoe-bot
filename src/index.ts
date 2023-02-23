import { config, isProduction } from './config';
import { database } from './database';
import { logger } from './logger';
import { getCompletion } from './openai';
import { createPrompt } from './promt.repository';
import { replies } from './replies';
import { createUser, getUser } from './user.repository';
import { Bot } from 'grammy';

const bot = new Bot(config.botToken);

const valueOrNull = (value: string | undefined) => value ?? null;
const valueOrDefault = <T>(value: T | undefined, defaultValue: T) =>
  value ?? defaultValue;

const hasAccess = (username: string) =>
  config.allowedUsernames.includes(username);

bot.command('start', async (context) => {
  await context.reply(replies.start);
});

bot.command('help', async (context) => {
  await context.reply(replies.help);
});

const triggeredBy = isProduction()
  ? ['Ботинок,', 'ботинок,', 'Shoe,', 'shoe,']
  : ['Бомж,', 'бомж,', 'Hobo,', 'hobo,'];
const shouldBeIgnored = (text: string) => {
  return !triggeredBy.some((trigger) => text.startsWith(trigger));
};

const getPrompt = (text: string) => {
  const found = triggeredBy.find((trigger) => text.startsWith(trigger));
  if (!found) {
    return text;
  }

  return text.slice(found.length).trim();
};

bot.on('message:text', async (context) => {
  const { text } = context.message;
  const {
    id: userId,
    first_name: firstName,
    language_code: language,
    last_name: lastName,
    username,
  } = context.message.from;

  const notRightText = shouldBeIgnored(text);
  if (notRightText) {
    const myId = bot.botInfo.id;
    const repliedOnOthersMessage =
      context.message.reply_to_message?.from?.id !== myId;
    if (repliedOnOthersMessage) {
      return;
    }
  }

  let user = await getUser(userId);
  if (!user) {
    user = await createUser({
      firstName: valueOrNull(firstName),
      id: userId,
      language: valueOrNull(language),
      lastName: valueOrNull(lastName),
      username: valueOrNull(username),
    });
  }

  // Disable bot for other users for now
  const hasNoAccess = !hasAccess(valueOrDefault(username, ''));
  if (hasNoAccess) {
    await context.reply(replies.notAllowed);
    return;
  }

  const prompt = getPrompt(text);
  const { message_id: replyToMessageId } = context.message;

  try {
    const completition = await getCompletion(prompt);
    await context.reply(completition ?? 'LOL', {
      reply_to_message_id: replyToMessageId,
    });
    await createPrompt({
      result: completition,
      text: prompt,
      userId,
    });
  } catch (error) {
    await context.reply(replies.error);
    throw error;
  }
});

bot.catch(logger.error);

const start = async () => {
  await database.$connect();
  logger.info('database connected');
  // eslint-disable-next-line promise/prefer-await-to-then
  bot.start().catch(async (error) => {
    logger.error(error);
    await database.$disconnect();
  });
};

start()
  .then(() => logger.info('bot started'))
  .catch(logger.error);
