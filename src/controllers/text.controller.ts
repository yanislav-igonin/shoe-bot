/* eslint-disable complexity */
import { telegram } from '../telegram.js';
import { textTriggerController } from './textTrigger.controller.js';
import { type Message } from '@prisma/client';
import { MessageType } from '@prisma/client';
import { type Filter, InputFile } from 'grammy';
import { config } from 'lib/config.js';
import { type BotContext } from 'lib/context.js';
import { database } from 'lib/database.js';
import {
  base64ToImage,
  editImage,
  generateImage,
} from 'lib/imageGeneration.js';
import { logger } from 'lib/logger.js';
import {
  addAssistantContext,
  addContext,
  addSystemContext,
  getCompletion,
  maximumMessageLengthPrompt,
  Model,
  preparePrompt,
  understandImage,
} from 'lib/prompt.js';
import { replies } from 'lib/replies.js';
import fetch from 'node-fetch';

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
      if (!file.file_path) {
        logger.error(`File path is undefined for tgPhotoId: ${index.tgPhotoId}`);
        return { messageId: index.messageId, url: '' };
      }
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
      if (current.url) {
        accumulator[current.messageId] = current.url;
      }
      return accumulator;
    },
    {},
  );
  return tgImagesMapById;
};

const editImageController = async (
  context: Filter<BotContext, 'message:text'>,
) => {
  await context.replyWithChatAction('upload_photo');

  const { dialog, user } = context.state;
  const text = context.message.text; // This is the prompt for the edit
  const { message_id: messageId, reply_to_message: replyToMessage } =
    context.message;

  if (!replyToMessage || !replyToMessage.photo) {
    await context.reply(replies.replyToImageToEdit, {
      reply_to_message_id: messageId,
    });
    return;
  }

  const photoToEdit = replyToMessage.photo[replyToMessage.photo.length - 1];
  const fileId = photoToEdit.file_id;

  const fileInfo = await telegram.getFile(fileId);
  if (!fileInfo.file_path) {
    await context.reply(replies.error, {
      reply_to_message_id: messageId,
    });
    logger.error('Failed to get file path for image to edit');
    return;
  }

  const imageURL = `https://api.telegram.org/file/bot${config.botToken}/${fileInfo.file_path}`;

  let previousMessageInDb = await database.message.findFirst({
    where: {
      tgMessageId: replyToMessage.message_id.toString(),
      dialogId: dialog.id,
    },
  });

  if (!previousMessageInDb) {
    logger.warn(
      `Replied-to message (tgMessageId: ${replyToMessage.message_id}) not found in DB for edit. Proceeding.`,
    );
  }

  const newUserMessage = await database.message.create({
    data: {
      dialogId: dialog.id,
      replyToId: previousMessageInDb?.id,
      text: `Edit request: \"${text}\" for image ${fileId}`,
      tgMessageId: messageId.toString(),
      type: MessageType.text,
      userId: user.id,
    },
  });

  try {
    const imageResponse = await fetch(imageURL);
    if (!imageResponse.ok) {
      throw new Error(
        `Failed to fetch image for editing: ${imageResponse.statusText}`,
      );
    }
    const imageBuffer = await imageResponse.arrayBuffer();
    const imageToSend = Buffer.from(imageBuffer);

    const imageBase64 = await editImage(imageToSend, text);

    if (!imageBase64) {
      await context.reply(replies.error, {
        reply_to_message_id: messageId,
      });
      logger.error('Failed to edit image with OpenAI');
      return;
    }

    const editedImageBuffer = base64ToImage(imageBase64);
    const inputFile = new InputFile(editedImageBuffer, 'edited_image.png');

    const botReply = await context.replyWithPhoto(inputFile, {
      caption: `Edited image based on: \"${text}\"`,
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
        text: `Edited image for prompt: \"${text}\"`,
      },
    });
  } catch (error) {
    logger.error({ error, messageId, dialogId: dialog.id }, 'Error in editImageController');
    await context.reply(replies.errorEditingImage, {
      reply_to_message_id: messageId,
    });
  }
};

export const textController = async (
  context: Filter<BotContext, 'message:text'>,
) => {
  const {
    state: { user, dialog, userSettings },
  } = context;
  const { text } = context.message;
  const { message_id: messageId, reply_to_message: replyToMessage } =
    context.message;

  const notReply = replyToMessage === undefined;
  const askedInPrivate = context.hasChatType('private');

  if (askedInPrivate && notReply) {
    await textTriggerController(context);
    return;
  }
  
  const isEditingImage = !!(replyToMessage && replyToMessage.photo && replyToMessage.photo.length > 0);

  if (isEditingImage) {
    await editImageController(context);
    return;
  }

  const messagesForDialogCheck = await database.message.findMany({
    where: { dialogId: dialog.id },
    orderBy: { createdAt: 'asc' },
  });

  const hasImagesInDialog = messagesForDialogCheck.some(msg => msg.type === MessageType.image && msg.tgPhotoId);

  if (hasImagesInDialog && !isEditingImage) {
    await context.replyWithChatAction('upload_photo');
    const newUserMessage = await database.message.create({
      data: {
        dialogId: dialog.id,
        text,
        tgMessageId: messageId.toString(),
        type: MessageType.text,
        userId: user.id,
      },
    });

    try {
      const allMessagesInDialog = await database.message.findMany({
        where: { dialogId: dialog.id, id: { not: newUserMessage.id } },
        orderBy: { createdAt: 'asc' },
      });

      const tgImagesMapById = await getImagesMapById(allMessagesInDialog);
      const imageMessages = allMessagesInDialog.filter(
        (message) => message.tgPhotoId && tgImagesMapById[message.id],
      );

      let contextForGeneration = text;

      if (imageMessages.length > 0) {
        const lastImageMessage = imageMessages[imageMessages.length - 1];
        const whatsOnImage = await understandImage(lastImageMessage, tgImagesMapById);
        const upgradedContextPrompt = await getCompletion(text, [
          addAssistantContext(whatsOnImage),
          addSystemContext(
            'Based on the previous image and the user\\'s request, create a detailed prompt for a new image generation. The prompt should be a clear and concise description of the desired image.',
          ),
        ]);
        contextForGeneration = upgradedContextPrompt;
      }
      
      logger.info({dialogId: dialog.id, prompt: contextForGeneration}, "Generating image with prompt");

      const imageBase64 = await generateImage(contextForGeneration);
      if (!imageBase64) {
        await context.reply(replies.error, { reply_to_message_id: messageId });
        logger.error('Failed to generate image');
        return;
      }

      const buffer = base64ToImage(imageBase64);
      const file = new InputFile(buffer, 'image.png');
      const botReply = await context.replyWithPhoto(file, {
        reply_to_message_id: messageId,
        caption: `Generated image for: \"${text}\"`
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
          text: `Generated based on: \"${contextForGeneration}\"`
        },
      });
      return;
    } catch (error) {
      logger.error({ error, messageId, dialogId: dialog.id }, 'Error in image generation flow');
      await context.reply(replies.error, { reply_to_message_id: messageId });
      return;
    }
  }

  const prompt = preparePrompt(text);

  const previousMessageInDbText = await database.message.findFirst({
    where: {
      tgMessageId: replyToMessage?.message_id.toString() ?? '0',
    },
  });
  if (replyToMessage && !previousMessageInDbText && !isEditingImage) {
    logger.warn(`Replied-to message (tgMessageId: ${replyToMessage.message_id}) not found in DB for text reply.`)
  }

  const newUserMessage = await database.message.create({
    data: {
      dialogId: dialog.id,
      replyToId: previousMessageInDbText?.id,
      text,
      tgMessageId: messageId.toString(),
      type: MessageType.text,
      userId: user.id,
    },
  });

  const messagesInDialogForText = await database.message.findMany({
    where: {
      dialogId: dialog.id,
      id: {
        not: newUserMessage.id,
      },
    },
  });

  const botRole = await database.botRole.findFirst({
    where: { id: userSettings.botRoleId },
  });
  if (!botRole) {
    logger.error('Bot role is undefined');
    await context.reply(replies.error, { reply_to_message_id: messageId });
    return;
  }

  const previousMessagesContext = messagesInDialogForText.map(addContext([]));
  previousMessagesContext.unshift(
    addSystemContext(maximumMessageLengthPrompt),
    addSystemContext(botRole.systemPrompt),
  );

  try {
    await context.replyWithChatAction('typing');
    const completition = await getCompletion(
      prompt,
      previousMessagesContext,
      Model.Grok3,
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
    logger.error({error, messageId, dialogId: dialog.id}, "Error in textController completion")
    await context.reply(replies.error, {
      reply_to_message_id: messageId,
    });
  }
};
