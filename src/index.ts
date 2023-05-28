import { sortByCreatedAt } from './date';
import { config } from '@/config';
import { type Prompt } from '@/database';
import { database } from '@/database';
import {
  base64ToImage,
  generateImage,
  imageTriggerRegexp,
} from '@/imageGeneration';
import { logger } from '@/logger';
import {
  adminMiddleware,
  chatMiddleware,
  stateMiddleware,
  userMiddleware,
} from '@/middlewares';
import {
  addAssistantContext,
  addSystemContext,
  addUserContext,
  aggressiveSystemPrompt,
  doAnythingPrompt,
  getAnswerToReplyMatches,
  getCompletion,
  getModelForTask,
  getRandomEncounterWords,
  getSmartCompletion,
  preparePrompt,
  shouldMakeRandomEncounter,
  smartTextTriggerRegexp,
  textTriggerRegexp,
} from '@/prompt';
import { replies } from '@/replies';
import {
  botReply as botReplyRepo,
  dialog as dialogRepo,
  image as imageRepo,
  prompt as promptRepo,
  stats as statsRepo,
  user as userRepo,
} from '@/repositories';
import { valueOrNull } from '@/values';
import { type BotContext } from 'context';
import { Bot, InputFile } from 'grammy';

const bot = new Bot<BotContext>(config.botToken);

bot.catch((error) => {
  // @ts-expect-error Property 'response' does not exist on type '{}'.ts(2339)
  if (error.error?.response?.data?.error) {
    // @ts-expect-error Property 'response' does not exist on type '{}'.ts(2339)
    logger.error(error.error?.response?.data?.error.message);
    return;
  }

  logger.error(error);
});

bot.use(chatMiddleware);
bot.use(stateMiddleware);
bot.use(userMiddleware);

bot.command('start', async (context) => {
  await context.reply(replies.start);
});

bot.command('help', async (context) => {
  await context.reply(replies.help, { parse_mode: 'Markdown' });
});

bot.command('stats', adminMiddleware, async (context) => {
  const [promptsForLastMonth, imagesForLastMonth] = await Promise.all([
    statsRepo.getPromptsCountForLastMonthGroupedByUser(),
    statsRepo.getImagesCountForLastMonthGroupedByUser(),
  ]);

  let text = 'Статистика за последний месяц:\n\nПромты:\n\n';
  for (const stat of promptsForLastMonth) {
    const { firstName, lastName, promptsCount, username } = stat;
    const row = `${firstName} ${lastName} (@${username}): ${promptsCount}\n`;
    text += row;
  }

  text += '\nИзображения:\n\n';
  for (const stat of imagesForLastMonth) {
    const { firstName, lastName, imagesCount, username } = stat;
    const row = `${firstName} ${lastName} (@${username}): ${imagesCount}\n`;
    text += row;
  }

  await context.reply(text);
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

/**
 * Handling gpt-4 requests.
 */
bot.hears(smartTextTriggerRegexp, async (context) => {
  const {
    match,
    message,
    state: { user: databaseUser },
  } = context;
  if (!message) {
    return;
  }

  const text = match[3];
  const {
    message_id: messageId,
    from,
    date: messageDate,
    chat: { id: chatId },
  } = message;

  const {
    id: userId,
    first_name: firstName,
    language_code: language,
    last_name: lastName,
    username,
  } = from;

  const hasNoAccess = databaseUser.isAllowed === false;

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
      reply_to_message_id: messageId,
    });
    return;
  }

  const prompt = preparePrompt(text);
  const systemContext = [addSystemContext(doAnythingPrompt)];

  try {
    await context.replyWithChatAction('typing');
    const model = await getModelForTask(prompt);
    const completition = await getSmartCompletion(prompt, systemContext, model);
    const botReply = await context.reply(completition, {
      reply_to_message_id: messageId,
    });
    const dialog = await dialogRepo.create();
    await promptRepo.create({
      createdAt: new Date(messageDate * 1_000),
      dialogId: dialog.id,
      result: completition,
      text: prompt,
      userId: userId.toString(),
    });
    const { message_id: botReplyMessageId, date: botReplyMessageDate } =
      botReply;
    const uniqueBotReplyId = `${chatId}_${botReplyMessageId}`;
    await botReplyRepo.create({
      createdAt: new Date(botReplyMessageDate * 1_000),
      dialogId: dialog.id,
      id: uniqueBotReplyId,
      text: completition,
    });
  } catch (error) {
    await context.reply(replies.error, {
      reply_to_message_id: messageId,
    });
    throw error;
  }
});

/**
 * Handling text-davinci-003 requests.
 */
bot.hears(textTriggerRegexp, async (context) => {
  const {
    match,
    message,
    state: { user: databaseUser },
  } = context;
  if (!message) {
    return;
  }

  const text = match[3];
  const {
    message_id: messageId,
    date: messageDate,
    from,
    chat: { id: chatId },
  } = message;

  const {
    id: userId,
    first_name: firstName,
    language_code: language,
    last_name: lastName,
    username,
  } = from;

  const hasNoAccess = databaseUser.isAllowed === false;

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
      reply_to_message_id: messageId,
    });
    return;
  }

  const prompt = preparePrompt(text);

  try {
    await context.replyWithChatAction('typing');
    const completition = await getCompletion(prompt);
    const botReply = await context.reply(completition, {
      reply_to_message_id: messageId,
    });
    const dialog = await dialogRepo.create();
    await promptRepo.create({
      createdAt: new Date(messageDate * 1_000),
      dialogId: dialog.id,
      result: completition,
      text: prompt,
      userId: userId.toString(),
    });
    const { message_id: botReplyMessageId, date: botReplyMessageDate } =
      botReply;
    const uniqueBotReplyId = `${chatId}_${botReplyMessageId}`;
    await botReplyRepo.create({
      createdAt: new Date(botReplyMessageDate * 1_000),
      dialogId: dialog.id,
      id: uniqueBotReplyId,
      text: completition,
    });
  } catch (error) {
    await context.reply(replies.error, {
      reply_to_message_id: messageId,
    });
    throw error;
  }
});

/**
 * For handling replies and random encounters
 */
bot.on('message:text', async (context) => {
  const {
    state: { user: databaseUser },
  } = context;
  const { text } = context.message;
  const {
    message_id: messageId,
    reply_to_message: messageRepliedOn,
    from,
    chat,
    date: messageDate,
  } = context.message;

  const {
    id: userId,
    first_name: userFirstName,
    language_code: userLanguage,
    last_name: userLastName,
    username,
  } = from;

  const { id: chatId } = chat;

  const botId = context.me.id;
  const shouldReplyRandomly = shouldMakeRandomEncounter();
  const notReply = messageRepliedOn === undefined;
  const repliedOnBotsMessage = messageRepliedOn?.from?.id === botId;
  const repliedOnOthersMessage = !repliedOnBotsMessage;
  const hasNoAccess = databaseUser.isAllowed === false;
  const askedInPrivate = context.hasChatType('private');

  let user = await userRepo.get(userId.toString());
  if (!user) {
    user = await userRepo.create({
      firstName: valueOrNull(userFirstName),
      id: userId.toString(),
      language: valueOrNull(userLanguage),
      lastName: valueOrNull(userLastName),
      username: valueOrNull(username),
    });
  }

  // Random encounter, shouldn't be triggered on reply.
  // Triggered by chance, replies to any message just4lulz
  if (shouldReplyRandomly && notReply) {
    // Forbid random encounters in private chats to prevent
    // access to the bot for non-allowed users
    if (askedInPrivate) {
      return;
    }

    const encounterPrompt = preparePrompt(text);
    const randomWords = getRandomEncounterWords();
    const withRandomWords =
      'ОТВЕТЬ В СТИЛЕ ЧЕРНОГО ЮМОРА С ИСПОЛЬЗОВАНИЕМ' +
      `СЛОВ ${randomWords.join(',')} НА ФРАЗУ ПОЛЬЗОВАТЕЛЯ`;

    const promptContext = [
      addSystemContext(aggressiveSystemPrompt),
      addSystemContext(withRandomWords),
    ];
    await context.replyWithChatAction('typing');

    try {
      const completition = await getSmartCompletion(
        encounterPrompt,
        promptContext,
      );

      const newBotMessage = await context.reply(completition, {
        reply_to_message_id: messageId,
      });
      const botMessageDate = newBotMessage.date;
      const newBotMessageId = `${newBotMessage.chat.id}_${newBotMessage.message_id}`;

      const newEncounterDialog = await dialogRepo.create();

      await botReplyRepo.create({
        createdAt: new Date(botMessageDate * 1_000),
        dialogId: newEncounterDialog.id,
        id: newBotMessageId,
        text: newBotMessage.text,
      });
      await promptRepo.create({
        createdAt: new Date(messageDate * 1_000),
        dialogId: newEncounterDialog.id,
        result: completition,
        text: encounterPrompt,
        userId: userId.toString(),
      });
      return;
    } catch (error) {
      await context.reply(replies.error, {
        reply_to_message_id: messageId,
      });
      throw error;
    }
  }

  // If user has no access and replied on bots message
  if (hasNoAccess && repliedOnBotsMessage) {
    await context.reply(replies.notAllowed, {
      reply_to_message_id: messageId,
    });
    return;
  }

  // If user has no access or its not a reply, ignore it
  if (hasNoAccess || notReply) {
    return;
  }

  const originalText = messageRepliedOn.text;

  // If user replied to other user message
  if (repliedOnOthersMessage) {
    // Check if user asked bot to take other user's message into account
    const answerToReplyMatches = getAnswerToReplyMatches(text);
    const shouldNotAnswerToReply = answerToReplyMatches === null;
    if (shouldNotAnswerToReply) {
      // Just return if not
      return;
    }

    const answerToReplyText = answerToReplyMatches[3];
    const answerToReplyPrompt = preparePrompt(answerToReplyText);
    const answerToReplyContext = [
      addSystemContext(
        `Ты должен ответить на соощение предыдущего пользователя: ${originalText}`,
      ),
      addSystemContext(aggressiveSystemPrompt),
    ];

    try {
      await context.replyWithChatAction('typing');
      const completition = await getSmartCompletion(
        answerToReplyPrompt,
        answerToReplyContext,
      );
      const botReplyOnOtherUserMessage = await context.reply(completition, {
        reply_to_message_id: messageId,
      });
      const botReplyOnOtherUserMessageId = `${chatId}_${botReplyOnOtherUserMessage.message_id}`;
      const botReplyOnOtherUserMessageDate = botReplyOnOtherUserMessage.date;

      const newDialogForOtherUser = await dialogRepo.create();

      await botReplyRepo.create({
        createdAt: new Date(botReplyOnOtherUserMessageDate * 1_000),
        dialogId: newDialogForOtherUser.id,
        id: botReplyOnOtherUserMessageId,
        text: botReplyOnOtherUserMessage.text,
      });

      await promptRepo.create({
        createdAt: new Date(messageDate * 1_000),
        dialogId: newDialogForOtherUser.id,
        result: completition,
        text: answerToReplyPrompt,
        userId: userId.toString(),
      });
      return;
    } catch (error) {
      await context.reply(replies.error, {
        reply_to_message_id: messageId,
      });
      throw error;
    }
  }

  // If we got there, it means that user replied to our message,
  // and we should have it, or throw an error, because it's a bug
  if (!messageRepliedOn) {
    throw new Error('Message replied on is undefined');
  }

  // If message replied on something that has no text (e.g.: replied on image), ignore it
  if (!originalText) {
    return;
  }

  const prompt = preparePrompt(text);

  const uniqueMessageRepliedOnId = `${chatId}_${messageRepliedOn.message_id}`;
  const previousBotMessage = await botReplyRepo.getOneById(
    uniqueMessageRepliedOnId,
  );

  let dialogId = '';
  if (!previousBotMessage) {
    const newDialog = await dialogRepo.create();
    dialogId = newDialog.id;
    await botReplyRepo.create({
      createdAt: new Date(),
      dialogId,
      id: uniqueMessageRepliedOnId,
      text: originalText,
    });
  }

  if (previousBotMessage) {
    dialogId = previousBotMessage.dialogId;
  }

  const dialog = await dialogRepo.get(dialogId);
  if (!dialog) {
    throw new Error('Dialog not found');
  }

  // Get all previous messages in dialog
  const previousUserMessages = await promptRepo.getListByDialogId(dialogId);
  const previousBotMessages = await botReplyRepo.getListByDialogId(dialogId);
  const previousMessages = [
    ...previousUserMessages,
    ...previousBotMessages,
  ].sort(sortByCreatedAt);
  // Assgign each message to user context or bot context
  const previousMessagesContext = previousMessages.map((message) => {
    if ((message as Prompt).userId === userId.toString()) {
      return addUserContext(message.text);
    }

    return addAssistantContext(message.text);
  });
  // Add aggressive system prompt to the beginning of the context
  previousMessagesContext.unshift(addSystemContext(aggressiveSystemPrompt));

  try {
    await context.replyWithChatAction('typing');
    const completition = await getSmartCompletion(
      prompt,
      previousMessagesContext,
    );
    const newBotMessage = await context.reply(completition, {
      reply_to_message_id: messageId,
    });
    const newBotMessageDate = newBotMessage.date;
    const newBotMessageId = `${newBotMessage.chat.id}_${newBotMessage.message_id}`;

    await botReplyRepo.create({
      createdAt: new Date(newBotMessageDate * 1_000),
      dialogId: dialog.id,
      id: newBotMessageId,
      text: newBotMessage.text,
    });

    await promptRepo.create({
      createdAt: new Date(messageDate * 1_000),
      dialogId: dialog.id,
      result: completition,
      text: prompt,
      userId: userId.toString(),
    });
  } catch (error) {
    await context.reply(replies.error, {
      reply_to_message_id: messageId,
    });
    throw error;
  }
});

/**
 * Admin commands.
 */

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
