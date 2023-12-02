import {
  botReply as botReplyRepo,
  dialog as dialogRepo,
  prompt as promptRepo,
} from '@/repositories';
import { type HearsContext } from 'grammy';
import { type BotContext } from 'lib/context';
import { getCompletion, preparePrompt } from 'lib/prompt';
import { replies } from 'lib/replies';

export const retardTriggerController = async (
  context: HearsContext<BotContext>,
) => {
  const {
    match,
    message,
    state: { user: databaseUser },
  } = context;
  if (!message) {
    return;
  }

  const text = match[3];
  const {
    message_id: messageId,
    date: messageDate,
    from,
    chat: { id: chatId },
  } = message;

  const { id: userId } = from;

  const hasNoAccess = databaseUser.isAllowed === false;

  if (hasNoAccess) {
    // If user has no access and just wrote a message with trigger
    await context.reply(replies.notAllowed, {
      reply_to_message_id: messageId,
    });
    return;
  }

  const prompt = preparePrompt(text);

  try {
    await context.replyWithChatAction('typing');
    const completition = await getCompletion(prompt);
    const botReply = await context.reply(completition, {
      reply_to_message_id: messageId,
    });
    const dialog = await dialogRepo.create();
    await promptRepo.create({
      createdAt: new Date(messageDate * 1_000),
      dialogId: dialog.id,
      result: completition,
      text: prompt,
      userId: userId.toString(),
    });
    const { message_id: botReplyMessageId, date: botReplyMessageDate } =
      botReply;
    const uniqueBotReplyId = `${chatId}_${botReplyMessageId}`;
    await botReplyRepo.create({
      createdAt: new Date(botReplyMessageDate * 1_000),
      dialogId: dialog.id,
      id: uniqueBotReplyId,
      text: completition,
    });
  } catch (error) {
    await context.reply(replies.error, {
      reply_to_message_id: messageId,
    });
    throw error;
  }
};