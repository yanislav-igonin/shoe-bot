import { MessageType } from '@prisma/client';
import { type Filter } from 'grammy';
import { userHasAccess } from 'lib/access';
import { config } from 'lib/config';
import { type BotContext } from 'lib/context';
import { database } from 'lib/database';
import { getCompletion, preparePrompt } from 'lib/prompt';
import { replies } from 'lib/replies';

export const retardTriggerController = async (
  context: Filter<BotContext, 'message:text'>,
) => {
  const {
    match,
    message,
    state: { user, dialog },
  } = context;

  if (!match) {
    return;
  }

  const text = match[3];
  const { message_id: messageId } = message;

  if (!userHasAccess(user)) {
    // If user has no access and just wrote a message with trigger
    await context.reply(replies.notAllowed, {
      reply_to_message_id: messageId,
    });
    return;
  }

  const newUserMessage = await database.message.create({
    data: {
      dialogId: dialog.id,
      text,
      tgMessageId: messageId.toString(),
      type: MessageType.text,
      userId: user.id,
    },
  });

  const prompt = preparePrompt(text);

  try {
    await context.replyWithChatAction('typing');
    const completition = await getCompletion(prompt);
    const botReply = await context.reply(completition, {
      reply_to_message_id: messageId,
    });

    await database.message.create({
      data: {
        dialogId: dialog.id,
        replyToId: newUserMessage.id,
        text: completition,
        tgMessageId: botReply.message_id.toString(),
        type: MessageType.text,
        userId: config.botId,
      },
    });
  } catch (error) {
    await context.reply(replies.error, {
      reply_to_message_id: messageId,
    });
    throw error;
  }
};
