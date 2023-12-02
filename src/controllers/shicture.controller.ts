import { base64ToImage, generateImage } from '@/imageGeneration';
import { logger } from '@/logger';
import { getShictureDescription } from '@/prompt';
import { replies } from '@/replies';
import { type BotContext } from 'context';
import { type CommandContext } from 'grammy';
import { InputFile } from 'grammy';

export const shictureController = async (
  context: CommandContext<BotContext>,
) => {
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

    await context.replyWithPhoto(file, { caption: prompt });
  } catch (error) {
    await context.reply((error as Error).message ?? replies.error);
    await context.reply(prompt);
    throw error;
  }
};
