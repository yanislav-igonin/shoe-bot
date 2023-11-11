import { config } from '@/config';
import { type User } from '@/database';
import { messageModel } from '@/database';
import { base64ToImage, generateImage } from '@/imageGeneration';
import { logger } from '@/logger';
import {
  addSystemContext,
  chooseTask,
  doAnythingPrompt,
  getModelForTask,
  getSmartCompletion,
  markdownRulesPrompt,
  preparePrompt,
} from '@/prompt';
import { replies } from '@/replies';
import { dialog as dialogRepo } from '@/repositories';
import { type BotContext } from 'context';
import { type HearsContext, InputFile } from 'grammy';
import { generateVoice } from 'voice';

const getTgMessageId = (context: HearsContext<BotContext>) => {
  const { message, chat } = context;
  if (!message) {
    return null;
  }

  return `${chat.id}_${message.message_id}`;
};

const getTgChatId = (context: HearsContext<BotContext>) => {
  const { chat } = context;
  if (!chat) {
    return null;
  }

  return chat.id.toString();
};

const hasAccess = (user: User) => {
  const { adminsUsernames } = config;
  const isAdmin = adminsUsernames.includes(user.username ?? '');
  if (isAdmin) {
    return true;
  }

  return user.isAllowed;
};

export const smartTextController = async (
  context: HearsContext<BotContext>,
) => {
  const {
    match,
    message: tgMessage,
    state: { user: databaseUser },
  } = context;
  if (!tgMessage) {
    return;
  }

  const messageText = match[3];
  const {
    message_id: messageId,
    date: messageDate,
    chat: { id: chatId },
  } = tgMessage;

  if (!hasAccess(databaseUser)) {
    // If user has no access and just wrote a message with trigger
    await context.reply(replies.notAllowed, {
      reply_to_message_id: messageId,
    });
    return;
  }

  const prompt = preparePrompt(messageText);
  const task = await chooseTask(prompt);
  const systemContext = [
    addSystemContext(doAnythingPrompt),
    addSystemContext(markdownRulesPrompt),
  ];

  const dialog = await dialogRepo.create();
  const tgMessageId = getTgMessageId(context);
  if (!tgMessageId) {
    throw new Error('Failed to get tgMessageId');
  }

  const tgChatId = getTgChatId(context);
  if (!tgChatId) {
    throw new Error('Failed to get tgChatId');
  }

  const userMessage = await messageModel.create({
    data: {
      chatId: tgChatId,
      createdAt: new Date(messageDate * 1_000),
      dialogId: dialog.id,
      text: messageText,
      tgMessageId,
      userId: databaseUser.id,
    },
  });

  const textController = async () => {
    await context.replyWithChatAction('typing');
    const model = await getModelForTask(prompt);
    const completition = await getSmartCompletion(prompt, systemContext, model);
    const botReply = await context.reply(completition, {
      parse_mode: 'Markdown',
      reply_to_message_id: messageId,
    });

    const botReplyMessageId = `${chatId}_${botReply.message_id}`;
    await messageModel.create({
      data: {
        chatId: tgChatId,
        createdAt: new Date(messageDate * 1_000),
        dialogId: dialog.id,
        replyToId: userMessage.id,
        text: completition,
        tgMessageId: botReplyMessageId,
        userId: 'bot',
      },
    });
  };

  const imageController = async () => {
    await context.replyWithChatAction('upload_photo');

    const imageBase64 = await generateImage(prompt);
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
    const photoId = botReply.photo[botReply.photo.length - 1].file_id;

    await messageModel.create({
      data: {
        chatId: tgChatId,
        createdAt: new Date(botReply.date * 1_000),
        dialogId: dialog.id,
        replyToId: userMessage.id,
        text: prompt,
        tgMessageId: `${chatId}_${botReply.message_id}`,
        tgPhotoId: photoId,
        userId: 'bot',
      },
    });
  };

  const voiceController = async () => {
    await context.replyWithChatAction('record_voice');

    const model = await getModelForTask(prompt);
    const completition = await getSmartCompletion(prompt, systemContext, model);
    const voice = await generateVoice(completition);

    const botReply = await context.api.sendVoice(chatId, voice, {
      reply_to_message_id: messageId,
    });
    const voiceId = botReply.voice.file_id;

    await messageModel.create({
      data: {
        chatId: tgChatId,
        createdAt: new Date(messageDate * 1_000),
        dialogId: dialog.id,
        replyToId: userMessage.id,
        text: completition,
        tgMessageId: `${chatId}_${botReply.message_id}`,
        tgVoiceId: voiceId,
        userId: 'bot',
      },
    });
  };

  const controllers = {
    image: imageController,
    text: textController,
    voice: voiceController,
  };

  try {
    await controllers[task]();
  } catch (error) {
    await context.reply(replies.error, {
      reply_to_message_id: messageId,
    });
    throw error;
  }
};
