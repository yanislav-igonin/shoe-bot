import { config } from './lib/config';
import { database } from './lib/database';
import {
  type NewChat,
  type NewDialog,
  type NewUser,
  type UserSettings,
} from '@prisma/client';
import { type NextFunction } from 'grammy';
// eslint-disable-next-line import/extensions
import { type Chat as TelegramChat } from 'grammy/out/types.node';
import { type BotContext } from 'lib/context';
import { textTriggerRegexp } from 'lib/prompt';
import { replies } from 'lib/replies';
import { valueOrNull } from 'lib/values';
import { DateTime } from 'luxon';

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

export const dialogMiddleware = async (
  context: BotContext,
  next: NextFunction,
) => {
  const { message } = context;
  if (!message) {
    // eslint-disable-next-line node/callback-return
    return;
  }

  const { reply_to_message: replyToMessage } = message;
  const { chat } = context.state;
  let newDialog: NewDialog;

  // If its a new dialog
  if (!replyToMessage) {
    newDialog = await database.newDialog.create({
      data: {
        chatId: chat.id,
      },
    });
    // eslint-disable-next-line require-atomic-updates
    context.state.dialog = newDialog;
    // eslint-disable-next-line node/callback-return
    await next();
    return;
  }

  const replyOnBotMessage =
    replyToMessage.from?.is_bot && replyToMessage.from.id === context.me.id;
  if (!replyOnBotMessage) {
    // Do nothing if user replied to a message that is not from the bot
    // TODO: Add a reply to the user so bot will be able to answer on text from different users message
    return;
  }

  const previousMessage = await database.message.findFirst({
    where: { tgMessageId: replyToMessage.message_id.toString() },
  });
  // If no previous message in the DB, but there is a reply
  if (!previousMessage) {
    await context.reply(replies.noPreviosData);
    // eslint-disable-next-line node/callback-return
    return;
  }

  const dialog = await database.newDialog.findFirst({
    where: { id: previousMessage?.dialogId ?? undefined },
  });
  if (!dialog) {
    newDialog = await database.newDialog.create({
      data: {
        chatId: chat.id,
      },
    });
    // eslint-disable-next-line require-atomic-updates
    context.state.dialog = newDialog;
    // eslint-disable-next-line node/callback-return
    await next();
    return;
  }

  // eslint-disable-next-line require-atomic-updates
  context.state.dialog = dialog;

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

  const toCreate: Omit<
    NewUser,
    'allowedTill' | 'createdAt' | 'id' | 'isAllowed'
  > = {
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

/**
 * Saves/gets user settings from the DB and puts it to the context.
 */
export const userSettingsMiddleware = async (
  context: BotContext,
  next: NextFunction,
) => {
  const {
    state: { user },
  } = context;

  const databaseUserSettings = await database.userSettings.findFirst({
    where: { userId: user.id },
  });
  if (databaseUserSettings) {
    // eslint-disable-next-line require-atomic-updates
    context.state.userSettings = databaseUserSettings;
    // eslint-disable-next-line node/callback-return
    await next();
    return;
  }

  const toCreate: Omit<UserSettings, 'createdAt' | 'id' | 'updatedAt'> = {
    botRoleId: 1,
    userId: user.id,
  };

  const newUserSettings = await database.userSettings.create({
    data: toCreate,
  });
  // eslint-disable-next-line require-atomic-updates
  context.state.userSettings = newUserSettings;

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

export const allowedMiddleware = async (
  context: BotContext,
  next: NextFunction,
) => {
  const { user } = context.state;

  const isNonBlockCommand =
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    context.message?.text?.startsWith('/start') ||
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    context.message?.text?.startsWith('/activate') ||
    context.message?.text?.startsWith('/profile');

  // If user want to activate subscription or check profile
  if (isNonBlockCommand) {
    // eslint-disable-next-line node/callback-return
    await next();
    return;
  }

  const isReplyOnBotMessage = Boolean(
    context.message?.reply_to_message?.from?.is_bot,
  );
  const messageMatchesTrigger = Boolean(
    context.message?.text?.match(textTriggerRegexp),
  );
  const isPrivateChat = context.chat?.type === 'private';
  // TODO: FIX HERE TRIGGER CONDITION ADD RANDOM ENCOUNTER
  const shouldTrigger =
    messageMatchesTrigger || isPrivateChat || isReplyOnBotMessage;
  if (!shouldTrigger) {
    return;
  }

  const { allowedTill } = user;
  // This is a hack to make allowedTill to be 0 if its undefined
  const startOfTime = new Date(0);
  const utcAllowedTill = DateTime.fromJSDate(allowedTill ?? startOfTime)
    .toUTC()
    .endOf('day');
  const utcNow = DateTime.now().toUTC();
  const subscriptionIsActive = utcNow < utcAllowedTill;
  const isAdmin = config.adminsUsernames.includes(user.username ?? '');

  const isAllowed =
    // For public chats
    (subscriptionIsActive && (isReplyOnBotMessage || messageMatchesTrigger)) ||
    // For private chats
    (subscriptionIsActive && isPrivateChat) ||
    // For admins
    isAdmin;

  if (!isAllowed) {
    await context.reply(replies.notAllowed, {
      parse_mode: 'Markdown',
      reply_to_message_id: context.message?.message_id,
    });
    return;
  }

  // eslint-disable-next-line node/callback-return
  await next();
};
