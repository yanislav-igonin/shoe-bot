import { type Context } from 'telegraf';
import { type Message } from 'telegraf/types';

const TELEGRAM_MESSAGE_LENGTH_LIMIT = 4_096;

export const replyInChunks = async (
  context: Context,
  text: string,
  extra: any,
): Promise<Message.TextMessage[]> => {
  if (text.length <= TELEGRAM_MESSAGE_LENGTH_LIMIT) {
    const message = await context.reply(text, extra);
    return [message];
  }

  const chunks: string[] = [];
  let currentChunk = '';

  for (const element of text) {
    currentChunk += element;
    if (currentChunk.length === TELEGRAM_MESSAGE_LENGTH_LIMIT) {
      chunks.push(currentChunk);
      currentChunk = '';
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  const sentMessages: Message.TextMessage[] = [];
  for (const chunk of chunks) {
    const sentMessage = await context.reply(chunk, extra);
    sentMessages.push(sentMessage);
  }

  return sentMessages;
};
