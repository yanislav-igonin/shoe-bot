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
import { saveChatMiddleware, saveUserMiddleware } from '@/middlewares';
import {
  addAssistantContext,
  addSystemContext,
  addUserContext,
  aggressiveSystemPrompt,
  doAnythingPrompt,
  getAnswerToReplyMatches,
  getCompletion,
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
  user as userRepo,
} from '@/repositories';
import { valueOrDefault, valueOrNull } from '@/values';
import { Bot, InputFile } from 'grammy';

const bot = new Bot(config.botToken);

bot.catch((error) => {
  // @ts-expect-error Property 'response' does not exist on type '{}'.ts(2339)
  if (error.error?.response?.data?.error) {
    // @ts-expect-error Property 'response' does not exist on type '{}'.ts(2339)
    logger.error(error.error?.response?.data?.error.message);
    return;
  }

  logger.error(error);
});

bot.use(saveChatMiddleware);
bot.use(saveUserMiddleware);

bot.command('start', async (context) => {
  await context.reply(replies.start);
});

bot.command('help', async (context) => {
  await context.reply(replies.help, { parse_mode: 'Markdown' });
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
// bot.hears(smartTextTriggerRegexp, async (context) => {
//   const { match, message } = context;
//   if (!message) {
//     return;
//   }

//   const text = match[3];
//   const { message_id: replyToMessageId, from } = message;

//   const {
//     id: userId,
//     first_name: firstName,
//     language_code: language,
//     last_name: lastName,
//     username,
//   } = from;

//   const hasNoAccess = !userRepo.hasAccess(valueOrDefault(username, ''));

//   let user = await userRepo.get(userId.toString());
//   if (!user) {
//     user = await userRepo.create({
//       firstName: valueOrNull(firstName),
//       id: userId.toString(),
//       language: valueOrNull(language),
//       lastName: valueOrNull(lastName),
//       username: valueOrNull(username),
//     });
//   }

//   if (hasNoAccess) {
//     // If user has no access and just wrote a message with trigger
//     await context.reply(replies.notAllowed, {
//       reply_to_message_id: replyToMessageId,
//     });
//     return;
//   }

//   const prompt = preparePrompt(text);
//   const systemContext = [addSystemContext(doAnythingPrompt)];

//   try {
//     await context.replyWithChatAction('typing');
//     const completition = await getSmartCompletion(prompt, systemContext);
//     await context.reply(completition, {
//       reply_to_message_id: replyToMessageId,
//     });
//     const dialog = await dialogRepo.create();
//     await promptRepo.create({
//       dialogId: dialog.id,
//       result: completition,
//       text: prompt,
//       userId: userId.toString(),
//     });
//   } catch (error) {
//     await context.reply(replies.error, {
//       reply_to_message_id: replyToMessageId,
//     });
//     throw error;
//   }
// });

/**
 * Handling text-davinci-003 requests.
 */
bot.hears(textTriggerRegexp, async (context) => {
  const { match, message } = context;
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
      createdAt: new Date(messageDate),
      dialogId: dialog.id,
      result: completition,
      text: prompt,
      userId: userId.toString(),
    });
    const { message_id: botReplyMessageId, date: botReplyMessageDate } =
      botReply;
    const uniqueBotReplyId = `${chatId}_${botReplyMessageId}`;
    await botReplyRepo.create({
      createdAt: new Date(botReplyMessageDate),
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
  const hasNoAccess = !userRepo.hasAccess(valueOrDefault(username, ''));
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
    // TODO: uncomment when ready
    // if (askedInPrivate) {
    //   return;
    // }

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
        createdAt: new Date(botMessageDate),
        dialogId: newEncounterDialog.id,
        id: newBotMessageId,
        text: newBotMessage.text,
      });
      await promptRepo.create({
        createdAt: new Date(messageDate),
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

  // // If user has no access and replied on bots message
  if (hasNoAccess && repliedOnBotsMessage) {
    await context.reply(replies.notAllowed, {
      reply_to_message_id: messageId,
    });
    return;
  }

  // // If user has no access or its not a reply, ignore it
  if (hasNoAccess || notReply) {
    return;
  }

  const originalText = messageRepliedOn!.text;

  // If user replied to other user message
  // if (repliedOnOthersMessage) {
  //   // Check if user asked bot to take other user's message into account
  //   const answerToReplyMatches = getAnswerToReplyMatches(text);
  //   const shouldNotAnswerToReply = answerToReplyMatches === null;
  //   if (shouldNotAnswerToReply) {
  //     // Just return if not
  //     return;
  //   }

  //   const answerToReplyText = answerToReplyMatches[3];
  //   const answerToReplyPrompt = preparePrompt(answerToReplyText);
  //   const answerToReplyContext = [
  //     addSystemContext(
  //       `Ты должен ответить на соощение предыдущего пользователя: ${originalText}`,
  //     ),
  //     addSystemContext(funnyResultPrompt),
  //   ];

  //   try {
  //     await context.replyWithChatAction('typing');
  //     const completition = await getSmartCompletion(
  //       answerToReplyPrompt,
  //       answerToReplyContext,
  //     );
  //     await context.reply(completition, {
  //       reply_to_message_id: replyToMessageId,
  //     });
  //     await promptRepo.create({
  //       result: completition,
  //       text: answerToReplyPrompt,
  //       userId: userId.toString(),
  //     });
  //     return;
  //   } catch (error) {
  //     await context.reply(replies.error, {
  //       reply_to_message_id: replyToMessageId,
  //     });
  //     throw error;
  //   }
  // }

  // If we got there, it means that user replied to our message,
  // and we should have it, or throw an error, because it's a bug
  if (!messageRepliedOn) {
    throw new Error('Message replied on is undefined');
  }

  // If message replied on has no text (e.g.: replied on image), ignore it
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
      createdAt: new Date(newBotMessageDate),
      dialogId: dialog.id,
      id: newBotMessageId,
      text: newBotMessage.text,
    });

    await promptRepo.create({
      createdAt: new Date(messageDate),
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
