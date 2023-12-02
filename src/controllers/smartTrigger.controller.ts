import { MessageType } from '@prisma/client';
import { type Filter } from 'grammy';
import { InputFile } from 'grammy';
import { userHasAccess } from 'lib/access';
import { config } from 'lib/config';
import { type BotContext } from 'lib/context';
import { database } from 'lib/database';
import { base64ToImage, generateImage } from 'lib/imageGeneration';
import { logger } from 'lib/logger';
import {
  addSystemContext,
  chooseTask,
  doAnythingPrompt,
  getModelForTask,
  getSmartCompletion,
  markdownRulesPrompt,
  preparePrompt,
} from 'lib/prompt';
import { replies } from 'lib/replies';
import { generateVoice } from 'lib/voice';

export const smartTriggerController = async (
  context: Filter<BotContext, 'message:text'>,
) => {
  const {
    match,
    message,
    state: { user, dialog },
  } = context;

  const text = (match ? match[3] : message.text) ?? '';
  const { message_id: messageId, reply_to_message: replyToMessage } = message;

  if (!userHasAccess(user)) {
    // If user has no access and just wrote a message with trigger
    await context.reply(replies.notAllowed, {
      reply_to_message_id: messageId,
    });
    return;
  }

  const previousMessage = await database.message.findFirst({
    where: {
      tgMessageId: replyToMessage?.message_id.toString() ?? '0',
    },
  });
  const replyToId = previousMessage?.id ?? null;

  const newUserMessage = await database.message.create({
    data: {
      dialogId: dialog.id,
      replyToId,
      text,
      tgMessageId: messageId.toString(),
      type: MessageType.text,
      userId: user.id,
    },
  });

  const prompt = preparePrompt(text);
  const task = await chooseTask(prompt);
  const systemContext = [
    addSystemContext(doAnythingPrompt),
    addSystemContext(markdownRulesPrompt),
  ];

  const textController = async () => {
    await context.replyWithChatAction('typing');
    const model = await getModelForTask(prompt);
    const completition = await getSmartCompletion(prompt, systemContext, model);
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
    const botMessageId = botReply.message_id.toString();
    const botFileId = botReply.photo[botReply.photo.length - 1].file_id;
    await database.message.create({
      data: {
        dialogId: dialog.id,
        replyToId: newUserMessage.id,
        tgMessageId: botMessageId,
        tgPhotoId: botFileId,
        type: MessageType.photo,
        userId: config.botId,
      },
    });
  };

  const voiceController = async () => {
    await context.replyWithChatAction('record_voice');

    const model = await getModelForTask(prompt);
    const completition = await getSmartCompletion(prompt, systemContext, model);
    const voice = await generateVoice(completition);

    const botReply = await context.replyWithVoice(voice, {
      reply_to_message_id: messageId,
    });

    await database.message.create({
      data: {
        dialogId: dialog.id,
        replyToId: newUserMessage.id,
        tgMessageId: botReply.message_id.toString(),
        tgVoiceId: botReply.voice.file_id,
        type: MessageType.voice,
        userId: config.botId,
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
