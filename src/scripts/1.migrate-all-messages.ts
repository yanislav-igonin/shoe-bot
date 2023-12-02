// eslint-disable-next-line canonical/filename-match-regex
import {
  type ChatType,
  type Message,
  type MessageType,
  type NewChat,
  type NewDialog,
  type NewUser,
} from '@prisma/client';
import { database } from 'lib/database';
import { logger } from 'lib/logger';

const run = async () => {
  await database.$connect();

  // Create Bot user
  await database.newUser.create({
    data: {
      firstName: 'Bot',
      id: 0,
      isAllowed: true,
      lastName: 'Bot',
      tgId: '0',
      username: 'Bot',
    },
  });

  // Recreate users
  const users = await database.user.findMany();
  const newUsers = users.map((user) => {
    const newUser: Omit<NewUser, 'id'> = {
      createdAt: user.createdAt,
      firstName: user.firstName,
      isAllowed: user.isAllowed,
      languageCode: user.language,
      lastName: user.lastName,
      tgId: user.id,
      username: user.username,
    };
    return newUser;
  });
  await database.newUser.createMany({
    data: newUsers,
  });

  // Recreate chats
  // const chats = await database.chat.findMany();
  // const newChats = chats.map((chat) => {
  //   const newChat: Omit<NewChat, 'id'> = {
  //     createdAt: chat.createdAt,
  //     name: chat.name,
  //     tgId: chat.id,
  //     type: chat.type as ChatType,
  //   };
  //   return newChat;
  // });
  // await database.newChat.createMany({
  //   data: newChats,
  // });

  // // Recreate dialogs
  // const dialogs = await database.dialog.findMany();
  // const newDialogs = dialogs.map((dialog) => {
  //   const newDialog: Omit<NewDialog, 'id'> = {
  //     chatId: null,
  //     createdAt: dialog.createdAt,
  //     oldId: dialog.id,
  //   };
  //   return newDialog;
  // });
  // await database.newDialog.createMany({
  //   data: newDialogs,
  // });
  // const createdNewDialogs = await database.newDialog.findMany();
  // const oldIdDialogIdMap = createdNewDialogs.reduce((accumulator, dialog) => {
  //   accumulator[dialog.oldId] = dialog.id;
  //   return accumulator;
  // }, {} as Record<string, number>);

  // const userMessages = await database.prompt.findMany();
  // const botMessages = await database.botReply.findMany();

  // const messages = [...userMessages, ...botMessages];
  // messages.sort((a, b) => {
  //   return a.createdAt.getTime() - b.createdAt.getTime();
  // });

  // const newMessages = messages.map((message) => {
  //   let type: MessageType;
  //   let newMessage: Message;
  //   // Prompt message
  //   // if (message.text && message.reply) {
  //   //   newMessage.createdAt = message.createdAt;
  //   //   newMessage.dialogId = message.dialogId ? oldIdDialogIdMap[message.dialogId] : null;
  //   //   newMessage.
  //   // };
  // });
};

run()
  .then(() => logger.info('data has been migrated'))
  .catch((error) => {
    logger.error(error);
    throw error;
  });
