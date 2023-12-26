/* eslint-disable complexity */
import { telegram } from '../telegram';
import { textTriggerController } from './textTrigger.controller';
import { type Message } from '@prisma/client';
import { MessageType } from '@prisma/client';
import { type Filter, InputFile } from 'grammy';
import { userHasAccess } from 'lib/access';
import { config } from 'lib/config';
import { type BotContext } from 'lib/context';
import { database } from 'lib/database';
import { base64ToImage, generateImage } from 'lib/imageGeneration';
import { logger } from 'lib/logger';
import { type Model } from 'lib/prompt';
import {
  addAssistantContext,
  addContext,
  addSystemContext,
  aggressiveSystemPrompt,
  doAnythingPrompt,
  getCompletion,
  getModelForTask,
  getRandomEncounterPrompt,
  getRandomEncounterWords,
  markdownRulesPrompt,
  preparePrompt,
  shouldMakeRandomEncounter,
  understandImage,
} from 'lib/prompt';
import { replies } from 'lib/replies';

const randomReplyController = async (
  context: Filter<BotContext, 'message:text'>,
) => {
  const {
    state: { user, dialog },
  } = context;
  const { text } = context.message;
  const { message_id: messageId } = context.message;
  const askedInPrivate = context.hasChatType('private');

  // Forbid random encounters in private chats to prevent
  // access to the bot for non-allowed users
  if (askedInPrivate) {
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-shadow
  const newUserMessage = await database.message.create({
    data: {
      dialogId: dialog.id,
      text,
      tgMessageId: messageId.toString(),
      type: MessageType.text,
      userId: user.id,
    },
  });

  const encounterPrompt = preparePrompt(text);
  const randomWords = getRandomEncounterWords();
  const withRandomWords = getRandomEncounterPrompt(randomWords);

  const promptContext = [addSystemContext(withRandomWords)];
  await context.replyWithChatAction('typing');

  try {
    const completition = await getCompletion(encounterPrompt, promptContext);

    const botReply = await context.reply(completition, {
      parse_mode: 'Markdown',
      reply_to_message_id: messageId,
    });
    await database.message.create({
      data: {
        dialogId: dialog.id,
        replyToId: newUserMessage.id,
        text: completition,
        tgMessageId: botReply.message_id.toString(),
        type: MessageType.text,
        userId: config.botId,
      },
    });
    return;
  } catch (error) {
    await context.reply(replies.error, {
      reply_to_message_id: messageId,
    });
    throw error;
  }
};

const getImagesMapById = async (messages: Message[]) => {
  // eslint-disable-next-line unicorn/no-array-reduce
  const tgImagesInDialog = messages.reduce<
    Array<{ messageId: number; tgPhotoId: string }>
  >((accumulator, message) => {
    if (!message.tgPhotoId) return accumulator;

    accumulator.push({
      messageId: message.id,
      tgPhotoId: message.tgPhotoId,
    });
    return accumulator;
  }, []);
  const tgImagesUrlsInDialog = await Promise.all(
    tgImagesInDialog.map(async (index) => {
      const file = await telegram.getFile(index.tgPhotoId);
      const url = `https://api.telegram.org/file/bot${config.botToken}/${file.file_path}`;
      return {
        messageId: index.messageId,
        url,
      };
    }),
  );
  // eslint-disable-next-line unicorn/no-array-reduce
  const tgImagesMapById = tgImagesUrlsInDialog.reduce<Record<number, string>>(
    (accumulator, current) => {
      accumulator[current.messageId] = current.url;
      return accumulator;
    },
    {},
  );
  return tgImagesMapById;
};

const generateBetterImageController = async (
  context: Filter<BotContext, 'message:text'>,
) => {
  await context.replyWithChatAction('upload_photo');

  const { dialog, user } = context.state;
  const text = context.message.text;
  const { message_id: messageId, reply_to_message: replyToMessage } =
    context.message;

  const previousMessage = await database.message.findFirst({
    where: {
      tgMessageId: replyToMessage?.message_id.toString() ?? '0',
    },
  });
  if (!previousMessage) {
    await context.reply(replies.noPreviosData);
    return;
  }

  const newUserMessage = await database.message.create({
    data: {
      dialogId: dialog.id,
      replyToId: previousMessage.id,
      text,
      tgMessageId: messageId.toString(),
      type: MessageType.image,
      userId: user.id,
    },
  });

  // Get all previous messages in dialog
  const messagesInDialog = await database.message.findMany({
    where: {
      dialogId: dialog.id,
    },
  });

  const tgImagesMapById = await getImagesMapById(messagesInDialog);
  const imageMessages = messagesInDialog.filter((message) => message.tgPhotoId);
  const lastImageMessage = imageMessages[imageMessages.length - 1];
  const whatsOnImage = await understandImage(lastImageMessage, tgImagesMapById);

  const upgradedContext = await getCompletion(text, [
    addAssistantContext(whatsOnImage),
    addSystemContext(
      'Результат должен быть новым четким описанием того, что попросили изменить.',
    ),
  ]);
  const imageBase64 = await generateImage(upgradedContext);
  if (!imageBase64) {
    await context.reply(replies.error, {
      reply_to_message_id: messageId,
    });
    logger.error('Failed to generate image');
    return;
  }

  const buffer = base64ToImage(imageBase64);
  const file = new InputFile(buffer, 'image.png');
  const botReply = await context.replyWithPhoto(file, {
    reply_to_message_id: messageId,
  });
  const botMessageId = botReply.message_id.toString();
  const botFileId = botReply.photo[botReply.photo.length - 1].file_id;
  await database.message.create({
    data: {
      dialogId: dialog.id,
      replyToId: newUserMessage.id,
      tgMessageId: botMessageId,
      tgPhotoId: botFileId,
      type: MessageType.image,
      userId: config.botId,
    },
  });
};

export const textController = async (
  context: Filter<BotContext, 'message:text'>,
) => {
  const {
    state: { user, dialog },
  } = context;
  const { text } = context.message;
  const { message_id: messageId, reply_to_message: replyToMessage } =
    context.message;

  const botId = context.me.id;
  const shouldReplyRandomly = shouldMakeRandomEncounter();
  const notReply = replyToMessage === undefined;
  const repliedOnBotsMessage = replyToMessage?.from?.id === botId;
  // const repliedOnMessageId = replyToMessage?.message_id;
  // const repliedOnOthersMessage = !repliedOnBotsMessage;
  const hasAccess = userHasAccess(user);
  const askedInPrivate = context.hasChatType('private');

  if (askedInPrivate && notReply) {
    await textTriggerController(context);
    return;
  }

  // Random encounter, shouldn't be triggered on reply.
  // Triggered by chance, replies to any message just4lulz
  if (shouldReplyRandomly && notReply) {
    await randomReplyController(context);
    return;
  }

  // If user has no access and replied on bots message
  if (!hasAccess && repliedOnBotsMessage) {
    await context.reply(replies.notAllowed, {
      reply_to_message_id: messageId,
    });
    return;
  }

  // If user has no access or its not a reply, ignore it
  if (!hasAccess || notReply) {
    return;
  }

  // TODO: Fix answer on other user message
  // If user replied to other user message
  // if (repliedOnOthersMessage) {
  //   // Check if user asked bot to take other user's message into account
  //   const answerToReplyMatches = getAnswerToReplyMatches(text);
  //   const shouldNotAnswerToReply = answerToReplyMatches === null;
  //   if (shouldNotAnswerToReply) {
  //     // Just return if not
  //     return;
  //   }

  //   const tgUserToAnswer = replyToMessage.from;
  //   if (!tgUserToAnswer) {
  //     throw new Error('User replied on is undefined');
  //   }

  //   let userToAnswer = await database.newUser.findFirst({
  //     where: { tgId: replyToMessage.from?.id.toString() },
  //   });
  //   if (!userToAnswer) {
  //     userToAnswer = await database.newUser.create({
  //       data: {
  //         firstName: valueOrNull(tgUserToAnswer.first_name),
  //         languageCode: valueOrNull(tgUserToAnswer.language_code),
  //         lastName: valueOrNull(tgUserToAnswer.last_name),
  //         tgId: tgUserToAnswer.id.toString(),
  //         username: valueOrNull(tgUserToAnswer.username),
  //       },
  //     });
  //   }

  //   const previousMessage = await database.message.create({
  //     data: {
  //       dialogId: dialog.id,
  //       text: replyToMessageText,
  //       tgMessageId: replyToMessage.message_id.toString(),
  //       type: MessageType.text,
  //       userId: userToAnswer.id,
  //     },
  //   });

  //   const answerToReplyText = answerToReplyMatches[3];
  //   const answerTextWithOriginalMessage = `${answerToReplyText}\n\n${replyToMessageText}`;
  //   const answerToReplyPrompt = preparePrompt(answerTextWithOriginalMessage);
  //   const answerToReplyContext = [
  //     addSystemContext(aggressiveSystemPrompt),
  //     addUserContext(replyToMessageText as string),
  //   ];

  //   const newUserMessage = await database.message.create({
  //     data: {
  //       dialogId: dialog.id,
  //       replyToId: previousMessage.id,
  //       text,
  //       tgMessageId: messageId.toString(),
  //       type: MessageType.text,
  //       userId: user.id,
  //     },
  //   });

  //   try {
  //     await context.replyWithChatAction('typing');
  //     const completition = await getSmartCompletion(
  //       answerToReplyPrompt,
  //       answerToReplyContext,
  //     );
  //     const botReply = await context.reply(completition, {
  //       reply_to_message_id: messageId,
  //     });
  //     await database.message.create({
  //       data: {
  //         dialogId: dialog.id,
  //         replyToId: newUserMessage.id,
  //         text: completition,
  //         tgMessageId: botReply.message_id.toString(),
  //         type: MessageType.text,
  //         userId: config.botId,
  //       },
  //     });
  //     return;
  //   } catch (error) {
  //     await context.reply(replies.error, {
  //       reply_to_message_id: messageId,
  //     });
  //     throw error;
  //   }
  // }

  const prompt = preparePrompt(text);

  const hasImages =
    (
      await database.message.findMany({
        where: {
          dialogId: dialog.id,
          type: MessageType.image,
        },
      })
    ).length > 0;
  if (hasImages) {
    await generateBetterImageController(context);
    return;
  }

  const previousMessage = await database.message.findFirst({
    where: {
      tgMessageId: replyToMessage?.message_id.toString() ?? '0',
    },
  });
  if (!previousMessage) {
    await context.reply(replies.noPreviosData);
    return;
  }

  const newUserMessage = await database.message.create({
    data: {
      dialogId: dialog.id,
      replyToId: previousMessage.id,
      text,
      tgMessageId: messageId.toString(),
      type: MessageType.text,
      userId: user.id,
    },
  });

  // Get all previous messages in dialog
  const messagesInDialog = await database.message.findMany({
    where: {
      dialogId: dialog.id,
    },
  });

  // Assgign each message to user context or bot context
  const previousMessagesContext = messagesInDialog.map(addContext([]));
  // Add aggressive system prompt to the beginning of the context
  previousMessagesContext.unshift(
    addSystemContext(doAnythingPrompt),
    addSystemContext(aggressiveSystemPrompt),
    addSystemContext(markdownRulesPrompt),
  );

  try {
    await context.replyWithChatAction('typing');
    let model: Model;
    if (hasImages) {
      model = 'gpt-4-vision-preview';
    } else if (dialog.isViolatesOpenAiPolicy) {
      model = 'gpt-4';
    } else {
      model = await getModelForTask(prompt);
    }

    const completition = await getCompletion(
      prompt,
      previousMessagesContext,
      model,
    );
    const botReply = await context.reply(completition, {
      parse_mode: 'Markdown',
      reply_to_message_id: messageId,
    });

    await database.message.create({
      data: {
        dialogId: dialog.id,
        replyToId: newUserMessage.id,
        text: completition,
        tgMessageId: botReply.message_id.toString(),
        type: MessageType.text,
        userId: config.botId,
      },
    });
  } catch (error) {
    await context.reply(replies.error, {
      reply_to_message_id: messageId,
    });
    throw error;
  }
};
