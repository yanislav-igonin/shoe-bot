import { config } from '@/config';
import { database } from '@/database';
import { logger } from '@/logger';
import {
  getCompletion,
  getPrompt,
  joinWithReply,
  shouldBeIgnored,
  shouldMakeRandomEncounter,
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
  const {
    message_id: replyToMessageId,
    reply_to_message: replyToMessage,
    from,
  } = context.message;

  const {
    id: userId,
    first_name: firstName,
    language_code: language,
    last_name: lastName,
    username,
  } = from;

  const myId = context.me.id;
  const shouldReplyRandomly = shouldMakeRandomEncounter();
  const wrongText = shouldBeIgnored(text);
  const replied = replyToMessage !== undefined;
  const repliedOnOthersMessage = replyToMessage?.from?.id !== myId;
  const hasNoAccess = !userRepo.hasAccess(valueOrDefault(username, ''));
  const askedInPrivate = context.hasChatType('private');

  let user = await userRepo.get(userId.toString());
  if (!user) {
    user = await userRepo.create({
      firstName: valueOrNull(firstName),
      id: userId.toString(),
      language: valueOrNull(language),
      lastName: valueOrNull(lastName),
      username: valueOrNull(username),
    });
  }

  // Random encounter. Triggered by chance, replies to any message just4lulz
  if (shouldReplyRandomly) {
    // Forbid random encounters in private chats to prevent
    // access to the bot for non-allowed users
    if (askedInPrivate) {
      return;
    }

    const encounterPrompt = getPrompt(text);
    const completition = await getCompletion(encounterPrompt);
    await context.reply(completition, {
      reply_to_message_id: replyToMessageId,
    });
    await promptRepo.create({
      result: completition,
      text: encounterPrompt,
      userId: userId.toString(),
    });
    return;
  }

  // Ignore messages that starts wrong and are not replies
  if (wrongText && !replied) {
    return;
  }

  // If user has no access and replied to my message
  if (hasNoAccess && replied) {
    // If user replied to other user message, ignore it
    if (repliedOnOthersMessage) {
      return;
    }

    // If user replied to my message, reply with error
    await context.reply(replies.notAllowed, {
      reply_to_message_id: replyToMessageId,
    });
    return;
  }

  // If user has no access and just wrote a message, not reply
  if (hasNoAccess && !replied) {
    await context.reply(replies.notAllowed, {
      reply_to_message_id: replyToMessageId,
    });
    return;
  }

  // If user has access and replied to my message
  if (replied) {
    // If user replied to other user message, ignore it
    if (repliedOnOthersMessage) {
      return;
    }

    const originalText = replyToMessage?.text;
    text = joinWithReply(originalText ?? '', text);
  }

  const prompt = getPrompt(text);

  try {
    await context.replyWithChatAction('typing');
    const completition = await getCompletion(prompt);
    await context.reply(completition, {
      reply_to_message_id: replyToMessageId,
    });
    await promptRepo.create({
      result: completition,
      text: prompt,
      userId: userId.toString(),
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
