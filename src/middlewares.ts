import { chat as chatRepo } from '@/repositories';
import { type Context, type NextFunction } from 'grammy';
// eslint-disable-next-line import/extensions
import { type Chat as TelegramChat } from 'grammy/out/types.node';

export const saveChatMiddleware = async (
  context: Context,
  next: NextFunction,
) => {
  const chatId = context.chat?.id;
  if (!chatId) {
    // eslint-disable-next-line node/callback-return
    await next();
    return;
  }

  const chat = await chatRepo.get(chatId.toString());
  if (chat) {
    // eslint-disable-next-line node/callback-return
    await next();
    return;
  }

  const name = (context.chat as TelegramChat.GroupChat).title ?? 'user';
  const toCreate = {
    id: chatId.toString(),
    name,
    type: context.chat?.type,
  };
  await chatRepo.create(toCreate);

  // eslint-disable-next-line node/callback-return
  await next();
};
