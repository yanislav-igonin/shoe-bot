import { config } from './config';
import { database } from './database';
import { logger } from './logger';
import { getCompletion } from './openai';
import { getPrompt, joinWithReply, shouldBeIgnored } from './prompt';
import { replies } from './replies';
import { createPrompt } from './repositories/promt.repository';
import { createUser, getUser, hasAccess } from './repositories/user.repository';
import { valueOrDefault, valueOrNull } from './values';
import { Bot } from 'grammy';

const bot = new Bot(config.botToken);

bot.command('start', async (context) => {
  await context.reply(replies.start);
});

bot.command('help', async (context) => {
  await context.reply(replies.help);
});

bot.on('message:text', async (context) => {
  let text = context.message.text;

  const wrongText = shouldBeIgnored(text);
  const { reply_to_message: replyToMessage } = context.message;
  const replied = replyToMessage !== undefined;
  if (wrongText && !replied) {
    return;
  }

  const {
    id: userId,
    first_name: firstName,
    language_code: language,
    last_name: lastName,
    username,
  } = context.message.from;

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

  if (replied) {
    const myId = bot.botInfo.id;
    const repliedOnOthersMessage = replyToMessage.from?.id !== myId;
    if (repliedOnOthersMessage) {
      return;
    }

    const originalText = replyToMessage.text;
    text = joinWithReply(originalText ?? '', text);
  }

  const prompt = getPrompt(text);
  const { message_id: replyToMessageId } = context.message;

  try {
    const completition = await getCompletion(prompt);
    await context.reply(completition, {
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
