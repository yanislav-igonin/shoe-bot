import { config } from '@/config';
import { database } from '@/database';
import {
  base64ToImage,
  generateImage,
  imageTriggerRegexp,
} from '@/imageGeneration';
import { logger } from '@/logger';
import {
  getCompletion,
  getPrompt,
  getRandomEncounterWords,
  getSmartCompletion,
  joinWithReply,
  shouldBeIgnored,
  shouldMakeRandomEncounter,
  smartTextTriggerRegexp,
  textTriggerRegexp,
} from '@/prompt';
import { replies } from '@/replies';
import {
  image as imageRepo,
  prompt as promptRepo,
  user as userRepo,
} from '@/repositories';
import { valueOrDefault, valueOrNull } from '@/values';
import { Bot, InputFile } from 'grammy';

const bot = new Bot(config.botToken);

bot.command('start', async (context) => {
  await context.reply(replies.start);
});

bot.command('help', async (context) => {
  await context.reply(replies.help);
});

bot.hears(imageTriggerRegexp, async (context) => {
  const { message, match } = context;
  if (!message) {
    return;
  }

  const prompt = match[3].trim();
  const { message_id: replyToMessageId } = message;

  await context.replyWithChatAction('upload_photo');

  try {
    const imageBase64 = await generateImage(prompt);
    if (!imageBase64) {
      await context.reply(replies.error, {
        reply_to_message_id: replyToMessageId,
      });
      logger.error('Failed to generate image');
      return;
    }

    const buffer = base64ToImage(imageBase64);
    const file = new InputFile(buffer, 'image.png');

    await context.replyWithPhoto(file, {
      reply_to_message_id: replyToMessageId,
    });

    await imageRepo.create({
      data: imageBase64,
      prompt,
      userId: message.from.id.toString(),
    });
  } catch (error) {
    await context.reply(replies.error, {
      reply_to_message_id: replyToMessageId,
    });
    throw error;
  }
});

const yesTriggerRegexp = /^да$/iu;
bot.hears(yesTriggerRegexp, async (context) => {
  const { message } = context;
  if (!message) {
    return;
  }

  const { message_id: replyToMessageId } = message;

  await context.reply(replies.yes, { reply_to_message_id: replyToMessageId });
});

const noTriggerRegexp = /^нет$/iu;
bot.hears(noTriggerRegexp, async (context) => {
  const { message } = context;
  if (!message) {
    return;
  }

  const { message_id: replyToMessageId } = message;

  await context.reply(replies.no, { reply_to_message_id: replyToMessageId });
});

bot.hears(smartTextTriggerRegexp, async (context) => {
  const { match, message } = context;
  if (!message) {
    return;
  }

  let text = match[3].trim();

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
  const replied = replyToMessage !== undefined;
  const repliedOnOthersMessage = replyToMessage?.from?.id !== myId;
  const hasNoAccess = !userRepo.hasAccess(valueOrDefault(username, ''));

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
    const completition = await getSmartCompletion(prompt);
    await context.reply(completition, {
      reply_to_message_id: replyToMessageId,
    });
    await promptRepo.create({
      result: completition,
      text: prompt,
      userId: userId.toString(),
    });
  } catch (error) {
    await context.reply(replies.error, {
      reply_to_message_id: replyToMessageId,
    });
    throw error;
  }
});

bot.hears(textTriggerRegexp, async (context) => {
  const { match, message } = context;
  if (!message) {
    return;
  }

  const text = match[3].trim();
  const { message_id: replyToMessageId, from } = message;

  const {
    id: userId,
    first_name: firstName,
    language_code: language,
    last_name: lastName,
    username,
  } = from;

  const hasNoAccess = !userRepo.hasAccess(valueOrDefault(username, ''));

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

  if (hasNoAccess) {
    // If user has no access and just wrote a message with trigger
    await context.reply(replies.notAllowed, {
      reply_to_message_id: replyToMessageId,
    });
    return;
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
    await context.reply(replies.error, {
      reply_to_message_id: replyToMessageId,
    });
    throw error;
  }
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
    const randomWords = getRandomEncounterWords();
    const withRandomWords =
      'ОТВЕТЬ В СТИЛЕ ЧЕРНОГО ЮМОРА С ИСПОЛЬЗОВАНИЕМ' +
      `СЛОВ ${randomWords.join(',')} НА ФРАЗУ НИЖЕ:\n\n${encounterPrompt}`;
    await context.replyWithChatAction('typing');

    try {
      const completition = await getCompletion(withRandomWords);
      await context.reply(completition, {
        reply_to_message_id: replyToMessageId,
      });
      await promptRepo.create({
        result: completition,
        text: encounterPrompt,
        userId: userId.toString(),
      });
      return;
    } catch (error) {
      await context.reply(replies.error, {
        reply_to_message_id: replyToMessageId,
      });
      throw error;
    }
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
    await context.reply(replies.error, {
      reply_to_message_id: replyToMessageId,
    });
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
