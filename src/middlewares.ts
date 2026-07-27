import { type ChatType } from './entities.js';
import {
  BotRole,
  Chat,
  Dialog,
  Message,
  User,
  UserSettings,
} from './entities.js';
import { config } from './lib/config.js';
import { getOrm } from './lib/database.js';
import { type EntityManager } from '@mikro-orm/postgresql';
import { type NextFunction } from 'grammy';
// @ts-expect-error openai/resources not found
// eslint-disable-next-line import/extensions
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
  // eslint-disable-next-line node/callback-return
  await next();
};

export const createEntityManagerMiddleware = (
  fork: () => EntityManager = () => getOrm().em.fork(),
) => {
  return async (context: BotContext, next: NextFunction) => {
    // eslint-disable-next-line require-atomic-updates
    context.state.em = fork();
    // eslint-disable-next-line node/callback-return
    await next();
  };
};

export const entityManagerMiddleware = createEntityManagerMiddleware();

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

  const { em } = context.state;
  const chat = await em.findOne(Chat, { tgId: chatId.toString() });
  if (chat) {
    const newName = (context.chat as TelegramChat.GroupChat).title ?? 'user';
    chat.name = newName;
    await em.flush();
    // eslint-disable-next-line require-atomic-updates
    context.state.chat = chat;
    // eslint-disable-next-line node/callback-return
    await next();
    return;
  }

  const name = (context.chat as TelegramChat.GroupChat).title ?? 'user';
  const newChat = em.create(Chat, {
    name,
    tgId: chatId.toString(),
    type: context.chat?.type as ChatType,
  });
  em.persist(newChat);
  await em.flush();
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
  const { chat, em } = context.state;
  let newDialog: Dialog;

  // If its a new dialog
  if (!replyToMessage) {
    newDialog = em.create(Dialog, { chat });
    em.persist(newDialog);
    await em.flush();
    // eslint-disable-next-line require-atomic-updates
    context.state.dialog = newDialog;
    // eslint-disable-next-line node/callback-return
    await next();
    return;
  }

  const replyOnBotMessage =
    replyToMessage.from?.is_bot && replyToMessage.from.id === context.me.id;
  if (!replyOnBotMessage) {
    newDialog = em.create(Dialog, { chat });
    em.persist(newDialog);
    await em.flush();
    // eslint-disable-next-line require-atomic-updates
    context.state.dialog = newDialog;
    // eslint-disable-next-line node/callback-return
    await next();
    return;
  }

  const previousMessage = await em.findOne(
    Message,
    { tgMessageId: replyToMessage.message_id.toString() },
    { populate: ['dialog'] },
  );
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

  const { dialog } = previousMessage;
  if (!dialog) {
    newDialog = em.create(Dialog, { chat });
    em.persist(newDialog);
    await em.flush();
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
  const { em } = context.state;

  const databaseUser = await em.findOne(User, { tgId: tgUserId.toString() });
  if (databaseUser) {
    databaseUser.firstName = valueOrNull(user.first_name);
    databaseUser.languageCode = valueOrNull(user.language_code);
    databaseUser.lastName = valueOrNull(user.last_name);
    databaseUser.username = valueOrNull(user.username);
    await em.flush();
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

  const newUser = em.create(User, {
    firstName: valueOrNull(firstName),
    languageCode: valueOrNull(language),
    lastName: valueOrNull(lastName),
    tgId: tgUserId.toString(),
    username: valueOrNull(username),
  });
  em.persist(newUser);
  await em.flush();
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
    state: { em, user },
  } = context;

  const databaseUserSettings = await em.findOne(UserSettings, { user });
  if (databaseUserSettings) {
    // eslint-disable-next-line require-atomic-updates
    context.state.userSettings = databaseUserSettings;
    // eslint-disable-next-line node/callback-return
    await next();
    return;
  }

  const newUserSettings = em.create(UserSettings, {
    botRole: em.getReference(BotRole, 1),
    user,
  });
  em.persist(newUserSettings);
  await em.flush();
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
    // eslint-disable-next-line node/callback-return
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
    // eslint-disable-next-line node/callback-return
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
    // eslint-disable-next-line node/callback-return
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
