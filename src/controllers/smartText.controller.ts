import { config } from '@/config';
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
import {
  botReply as botReplyRepo,
  dialog as dialogRepo,
  image as imageRepo,
  prompt as promptRepo,
} from '@/repositories';
import { type BotContext } from 'context';
import { type HearsContext } from 'grammy';
import { InputFile } from 'grammy';
import { generateVoice } from 'voice';

export const smartTextController = async (
  context: HearsContext<BotContext>,
) => {
  const {
    match,
    message,
    state: { user: databaseUser },
  } = context;
  if (!message) {
    return;
  }

  const text = (match ? match[3] : message.text) ?? '';
  const {
    message_id: messageId,
    from,
    date: messageDate,
    chat: { id: chatId },
  } = message;

  const { id: userId } = from;

  const hasAccess =
    databaseUser.isAllowed === false ||
    config.adminsUsernames.includes(databaseUser.username ?? '');

  if (!hasAccess) {
    // If user has no access and just wrote a message with trigger
    await context.reply(replies.notAllowed, {
      reply_to_message_id: messageId,
    });
    return;
  }

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

    await context.replyWithPhoto(file, {
      reply_to_message_id: messageId,
    });

    await imageRepo.create({
      data: imageBase64,
      prompt,
      userId: message.from.id.toString(),
    });
  };

  const voiceController = async () => {
    await context.replyWithChatAction('record_voice');

    const model = await getModelForTask(prompt);
    const completition = await getSmartCompletion(prompt, systemContext, model);
    const voice = await generateVoice(completition);

    const audio = await context.api.sendVoice(chatId, voice, {
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
    const { message_id: audioMessageId, date: audioMessageDate } = audio;
    const uniqueAudioId = `${chatId}_${audioMessageId}`;
    await botReplyRepo.create({
      createdAt: new Date(audioMessageDate * 1_000),
      dialogId: dialog.id,
      id: uniqueAudioId,
      text: completition,
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
