import { type CommandContext } from 'grammy';
import { InputFile } from 'grammy';
import { type BotContext } from 'lib/context';
import { base64ToImage, generateImage } from 'lib/imageGeneration';
import { logger } from 'lib/logger';
import { getShictureDescription } from 'lib/prompt';
import { replies } from 'lib/replies';

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
