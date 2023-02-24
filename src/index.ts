import { config } from '@/config';
import { database } from '@/database';
import { logger } from '@/logger';
import {
  getCompletion,
  getPrompt,
  joinWithReply,
  shouldBeIgnored,
} from '@/prompt';
import { replies } from '@/replies';
import { prompt as promptRepo, user as userRepo } from '@/repositories';
import { valueOrDefault, valueOrNull } from '@/values';
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

  let user = await userRepo.get(userId);
  if (!user) {
    user = await userRepo.create({
      firstName: valueOrNull(firstName),
      id: userId,
      language: valueOrNull(language),
      lastName: valueOrNull(lastName),
      username: valueOrNull(username),
    });
  }

  // Disable bot for other users for now
  const hasNoAccess = !userRepo.hasAccess(valueOrDefault(username, ''));
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
    await promptRepo.create({
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
