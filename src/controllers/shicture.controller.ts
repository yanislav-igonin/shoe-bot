import { MessageType } from '@prisma/client';
import { type CommandContext } from 'grammy';
import { InputFile } from 'grammy';
import { config } from 'lib/config.js';
import { type BotContext } from 'lib/context.js';
import { database } from 'lib/database.js';
import { base64ToImage, generateImage } from 'lib/imageGeneration.js';
import { logger } from 'lib/logger.js';
import { getShictureDescription } from 'lib/prompt.js';
import { replies } from 'lib/replies.js';

export const shictureController = async (
  context: CommandContext<BotContext>,
) => {
  const {
    message,
    state: { user, dialog },
  } = context;

  if (!message) {
    return;
  }

  const { message_id: messageId } = message;

  const newUserMessage = await database.message.create({
    data: {
      dialogId: dialog.id,
      text: message.text,
      tgMessageId: messageId.toString(),
      type: MessageType.image,
      userId: user.id,
    },
  });

  let prompt = '';
  try {
    await context.replyWithChatAction('upload_photo');
    prompt = await getShictureDescription();
    const imageBase64 = await generateImage(prompt);
    if (!imageBase64) {
      await context.reply(replies.error);
      logger.error('Failed to generate image');
      return;
    }

    const buffer = base64ToImage(imageBase64);
    const file = new InputFile(buffer, 'image.png');
    const botReply = await context.replyWithPhoto(file, {
      caption: prompt,
      reply_to_message_id: messageId,
    });
    const botMessageId = botReply.message_id.toString();
    const botFileId = botReply.photo[botReply.photo.length - 1].file_id;
    await database.message.create({
      data: {
        dialogId: dialog.id,
        replyToId: newUserMessage.id,
        text: prompt,
        tgMessageId: botMessageId,
        tgPhotoId: botFileId,
        type: MessageType.image,
        userId: config.botId,
      },
    });
  } catch (error) {
    await context.reply((error as Error).message ?? replies.error);
    const botReply = await context.reply(prompt);

    await database.message.create({
      data: {
        dialogId: dialog.id,
        replyToId: newUserMessage.id,
        text: prompt,
        tgMessageId: botReply.message_id.toString(),
        type: MessageType.image,
        userId: config.botId,
      },
    });

    throw error;
  }
};
