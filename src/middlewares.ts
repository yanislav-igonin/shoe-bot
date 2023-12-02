import { config } from './lib/config';
import { database } from './lib/database';
import { type NewChat, type NewUser } from '@prisma/client';
import { type NextFunction } from 'grammy';
// eslint-disable-next-line import/extensions
import { type Chat as TelegramChat } from 'grammy/out/types.node';
import { type BotContext } from 'lib/context';
import { valueOrNull } from 'lib/values';

/**
 * Makes state object inside the context to store some shit across the request.
 */
export const stateMiddleware = async (
  context: BotContext,
  next: NextFunction,
) => {
  // @ts-expect-error Property user   is missing in type {} but required in type
  context.state = {};
  // eslint-disable-next-line node/callback-return
  await next();
};

/**
 * Saves chat to the DB.
 */
export const chatMiddleware = async (
  context: BotContext,
  next: NextFunction,
) => {
  const chatId = context.chat?.id;
  if (!chatId) {
    // eslint-disable-next-line node/callback-return
    await next();
    return;
  }

  const chat = await database.newChat.findFirst({
    where: { tgId: chatId.toString() },
  });
  if (chat) {
    const newName = (context.chat as TelegramChat.GroupChat).title ?? 'user';
    await database.newChat.update({
      data: { name: newName },
      where: { id: chat.id },
    });
    // eslint-disable-next-line require-atomic-updates
    context.state.chat = chat;
    // eslint-disable-next-line node/callback-return
    await next();
    return;
  }

  const name = (context.chat as TelegramChat.GroupChat).title ?? 'user';
  const toCreate: Omit<NewChat, 'createdAt' | 'id'> = {
    name,
    tgId: chatId.toString(),
    type: context.chat?.type,
  };
  const newChat = await database.newChat.create({ data: toCreate });
  // eslint-disable-next-line require-atomic-updates
  context.state.chat = newChat;

  // eslint-disable-next-line node/callback-return
  await next();
};

/**
 * Saves/gets user from the DB and puts it to the context.
 */
export const userMiddleware = async (
  context: BotContext,
  next: NextFunction,
) => {
  const { from: user } = context;
  if (!user) {
    // eslint-disable-next-line node/callback-return
    await next();
    return;
  }

  const { id: tgUserId } = user;

  const databaseUser = await database.newUser.findFirst({
    where: { tgId: tgUserId.toString() },
  });
  if (databaseUser) {
    await database.newUser.update({
      data: {
        firstName: valueOrNull(user.first_name),
        languageCode: valueOrNull(user.language_code),
        lastName: valueOrNull(user.last_name),
        username: valueOrNull(user.username),
      },
      where: { id: databaseUser.id },
    });
    // eslint-disable-next-line require-atomic-updates
    context.state.user = databaseUser;
    // eslint-disable-next-line node/callback-return
    await next();
    return;
  }

  const {
    first_name: firstName,
    language_code: language,
    last_name: lastName,
    username,
  } = user;

  const toCreate: Omit<NewUser, 'createdAt' | 'id' | 'isAllowed'> = {
    firstName: valueOrNull(firstName),
    languageCode: valueOrNull(language),
    lastName: valueOrNull(lastName),
    tgId: tgUserId.toString(),
    username: valueOrNull(username),
  };

  const newUser = await database.newUser.create({ data: toCreate });
  // eslint-disable-next-line require-atomic-updates
  context.state.user = newUser;

  // eslint-disable-next-line node/callback-return
  await next();
};

export const adminMiddleware = async (
  context: BotContext,
  next: NextFunction,
) => {
  const {
    user: { username },
  } = context.state;
  const { adminsUsernames } = config;
  const isAllowed = adminsUsernames.includes(username ?? '');

  if (!isAllowed) {
    return;
  }

  // eslint-disable-next-line node/callback-return
  await next();
};
