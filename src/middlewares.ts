import { config } from './lib/config.js';
import { database } from './lib/database.js';
import {
  type Chat,
  type Dialog,
  type User,
  type UserSettings,
} from '@prisma/client';
import { type NextFunction } from 'grammy';
// @ts-expect-error openai/resources not found
import { type Chat as TelegramChat } from 'grammy/out/types.node';
import { type BotContext } from 'lib/context.js';
import { refundDailyRequest, reserveDailyRequest } from 'lib/dailyQuota.js';
import { logger } from 'lib/logger.js';
import { textTriggerRegexp } from 'lib/prompt.js';
import { replies } from 'lib/replies.js';
import { classifyRequest } from 'lib/requestAccess.js';
import { valueOrNull } from 'lib/values.js';
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
    await next();
    return;
  }

  const chat = await database.chat.findFirst({
    where: { tgId: chatId.toString() },
  });
  if (chat) {
    const newName = (context.chat as TelegramChat.GroupChat).title ?? 'user';
    await database.chat.update({
      data: { name: newName },
      where: { id: chat.id },
    });
    context.state.chat = chat;
    await next();
    return;
  }

  const name = (context.chat as TelegramChat.GroupChat).title ?? 'user';
  const toCreate: Omit<Chat, 'createdAt' | 'id'> = {
    name,
    tgId: chatId.toString(),
    type: context.chat?.type,
  };
  const newChat = await database.chat.create({ data: toCreate });
  context.state.chat = newChat;

  await next();
};

export const dialogMiddleware = async (
  context: BotContext,
  next: NextFunction,
) => {
  const { message } = context;
  if (!message) {
    return;
  }

  const { reply_to_message: replyToMessage } = message;
  const { chat } = context.state;
  let newDialog: Dialog;

  // If its a new dialog
  if (!replyToMessage) {
    newDialog = await database.dialog.create({
      data: {
        chatId: chat.id,
      },
    });
    context.state.dialog = newDialog;
    await next();
    return;
  }

  const replyOnBotMessage =
    replyToMessage.from?.is_bot && replyToMessage.from.id === context.me.id;
  if (!replyOnBotMessage) {
    newDialog = await database.dialog.create({
      data: {
        chatId: chat.id,
      },
    });
    context.state.dialog = newDialog;
    await next();
    return;
  }

  const previousMessage = await database.message.findFirst({
    where: { tgMessageId: replyToMessage.message_id.toString() },
  });
  // If no previous message in the DB, but there is a reply
  if (!previousMessage) {
    const error = new Error('Previous message is not available');
    try {
      await context.reply(replies.noPreviosData);
    } catch (replyError) {
      logger.error(replyError);
    }

    throw error;
  }

  const dialog = await database.dialog.findFirst({
    where: { id: previousMessage?.dialogId ?? undefined },
  });
  if (!dialog) {
    newDialog = await database.dialog.create({
      data: {
        chatId: chat.id,
      },
    });
    context.state.dialog = newDialog;
    await next();
    return;
  }

  context.state.dialog = dialog;

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
    await next();
    return;
  }

  const { id: tgUserId } = user;

  const databaseUser = await database.user.findFirst({
    where: { tgId: tgUserId.toString() },
  });
  if (databaseUser) {
    await database.user.update({
      data: {
        firstName: valueOrNull(user.first_name),
        languageCode: valueOrNull(user.language_code),
        lastName: valueOrNull(user.last_name),
        username: valueOrNull(user.username),
      },
      where: { id: databaseUser.id },
    });
    context.state.user = databaseUser;
    await next();
    return;
  }

  const {
    first_name: firstName,
    language_code: language,
    last_name: lastName,
    username,
  } = user;

  const toCreate: Omit<User, 'allowedTill' | 'createdAt' | 'id' | 'isAllowed'> =
    {
      firstName: valueOrNull(firstName),
      languageCode: valueOrNull(language),
      lastName: valueOrNull(lastName),
      tgId: tgUserId.toString(),
      username: valueOrNull(username),
    };

  const newUser = await database.user.create({ data: toCreate });
  context.state.user = newUser;

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
    context.state.userSettings = databaseUserSettings;
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
  context.state.userSettings = newUserSettings;

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

  await next();
};

export const allowedMiddleware = async (
  context: BotContext,
  next: NextFunction,
) => {
  const text = context.message?.text;
  const commandEntity = context.message?.entities?.find(
    (entity) => entity.type === 'bot_command' && entity.offset === 0,
  );
  const command =
    text && commandEntity ? text.slice(1, commandEntity.length) : undefined;
  const replyMessage = context.message?.reply_to_message;
  const replyFrom = replyMessage?.from;
  const isReplyToThisBot =
    replyFrom?.is_bot === true && replyFrom.id === context.me.id;
  const isReplyToAnotherBot =
    replyFrom?.is_bot === true && replyFrom.id !== context.me.id;
  const access = classifyRequest({
    botUsername: context.me.username,
    chatType: context.chat?.type,
    command,
    isReplyToAnotherBot,
    isReplyToThisBot,
    matchesTextTrigger: textTriggerRegexp.test(text ?? ''),
    text,
  });

  if (access === 'ignore') {
    return;
  }

  if (access === 'free') {
    await next();
    return;
  }

  const { user } = context.state;
  const { allowedTill } = user;
  const subscriptionIsActive =
    allowedTill !== null &&
    DateTime.now().toUTC() <
      DateTime.fromJSDate(allowedTill).toUTC().endOf('day');
  const isAdmin = config.adminsUsernames.includes(user.username ?? '');

  if (subscriptionIsActive || isAdmin) {
    await next();
    return;
  }

  const usage = await reserveDailyRequest(user.id);
  if (usage === null) {
    await context.reply(replies.dailyQuotaExhausted, {
      reply_to_message_id: context.message?.message_id,
    });
    return;
  }

  try {
    await next();
  } catch (error) {
    try {
      await refundDailyRequest(user.id);
    } catch (refundError) {
      logger.error(refundError);
    }

    throw error;
  }
};
