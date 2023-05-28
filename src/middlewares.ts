import { config } from './config';
import { chat as chatRepo, user as userRepo } from '@/repositories';
import { valueOrNull } from '@/values';
import { type BotContext } from 'context';
import { type Context, type NextFunction } from 'grammy';
// eslint-disable-next-line import/extensions
import { type Chat as TelegramChat } from 'grammy/out/types.node';

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
export const chatMiddleware = async (context: Context, next: NextFunction) => {
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

  const { id: userId } = user;

  const databaseUser = await userRepo.get(userId.toString());
  if (databaseUser) {
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

  const toCreate = {
    firstName: valueOrNull(firstName),
    id: userId.toString(),
    language: valueOrNull(language),
    lastName: valueOrNull(lastName),
    username: valueOrNull(username),
  };

  const newUser = await userRepo.create(toCreate);
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
