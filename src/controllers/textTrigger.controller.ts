import { MessageType } from '@prisma/client';
import { type Filter } from 'grammy';
import { InputFile } from 'grammy';
import { config } from 'lib/config.js';
import { type BotContext } from 'lib/context.js';
import { database } from 'lib/database.js';
import { generateImage } from 'lib/imageGeneration.js';
import { logger } from 'lib/logger.js';
import {
  addSystemContext,
  chooseTask,
  getCompletion,
  MAIN_MODEL,
  maximumMessageLengthPrompt,
  // markdownRulesPrompt,
  preparePrompt,
} from 'lib/prompt.js';
import { replies } from 'lib/replies.js';
// @ts-expect-error openai/resources not found
import { type ChatCompletionMessageParam } from 'openai/resources';

export const textTriggerController = async (
  context: Filter<BotContext, 'message:text'>,
) => {
  const {
    match,
    message,
    state: { user, dialog, userSettings },
  } = context;

  const text = (match ? match[3] : message.text) ?? '';
  const { message_id: messageId, reply_to_message: replyToMessage } = message;

  const prompt = preparePrompt(text);
  const task = await chooseTask(prompt);

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
      type: task,
      userId: user.id,
    },
  });

  const botRole = await database.botRole.findFirst({
    where: { id: userSettings.botRoleId },
  });
  if (!botRole) {
    const error = new Error('Bot role is undefined');
    logger.error('Bot role is undefined');
    try {
      await context.reply(replies.error, {
        reply_to_message_id: messageId,
      });
    } catch (replyError) {
      logger.error(replyError);
    }

    throw error;
  }

  const systemContext: ChatCompletionMessageParam[] = [
    // addSystemContext(markdownRulesPrompt),
    addSystemContext(maximumMessageLengthPrompt),
  ];
  if (botRole.systemPrompt) {
    systemContext.push(addSystemContext(botRole.systemPrompt));
  }

  const textController = async () => {
    await context.replyWithChatAction('typing');
    // let model = await getModelForTask(prompt);
    const model = MAIN_MODEL;
    // if (model === Model.Gpt4) {
    //   await database.dialog.update({
    //     data: { isViolatesOpenAiPolicy: true },
    //     where: { id: dialog.id },
    //   });
    //   model = Model.MistralLarge;
    // }

    const completition = await getCompletion(prompt, systemContext, model);

    for (const chunk of completition) {
      const botReply = await context.reply(chunk, {
        parse_mode: 'Markdown',
        reply_to_message_id: messageId,
      });

      await database.message.create({
        data: {
          dialogId: dialog.id,
          replyToId: newUserMessage.id,
          text: chunk,
          tgMessageId: botReply.message_id.toString(),
          type: MessageType.text,
          userId: config.botId,
        },
      });
    }
  };

  const imageController = async () => {
    await context.replyWithChatAction('upload_photo');

    const image = await generateImage(prompt);
    if (!image) {
      logger.error('Failed to generate image');
      throw new Error('Failed to generate image');
    }

    const source = typeof image === 'string' ? new URL(image) : image;
    const file = new InputFile(source, 'image.png');

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

  const controllers = {
    image: imageController,
    text: textController,
  };

  try {
    await controllers[task]();
  } catch (error) {
    try {
      await context.reply(replies.error, {
        reply_to_message_id: messageId,
      });
    } catch (replyError) {
      logger.error(replyError);
    }

    throw error;
  }
};
