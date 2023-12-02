import { smartTriggerController } from './smartTrigger.controller';
import {
  botReply as botReplyRepo,
  dialog as dialogRepo,
  prompt as promptRepo,
} from '@/repositories';
import { type Prompt } from '@prisma/client';
import { type Filter } from 'grammy';
import { type BotContext } from 'lib/context';
import { sortByCreatedAt } from 'lib/date';
import {
  addAssistantContext,
  addSystemContext,
  addUserContext,
  aggressiveSystemPrompt,
  doAnythingPrompt,
  getAnswerToReplyMatches,
  getRandomEncounterPrompt,
  getRandomEncounterWords,
  getSmartCompletion,
  markdownRulesPrompt,
  preparePrompt,
  shouldMakeRandomEncounter,
} from 'lib/prompt';
import { replies } from 'lib/replies';

export const textController = async (
  context: Filter<BotContext, 'message:text'>,
) => {
  const {
    state: { user: databaseUser },
  } = context;
  const { text } = context.message;
  const {
    message_id: messageId,
    reply_to_message: messageRepliedOn,
    from,
    chat,
    date: messageDate,
  } = context.message;

  const { id: userId } = from;

  const { id: chatId } = chat;

  const botId = context.me.id;
  const shouldReplyRandomly = shouldMakeRandomEncounter();
  const notReply = messageRepliedOn === undefined;
  const repliedOnBotsMessage = messageRepliedOn?.from?.id === botId;
  const repliedOnOthersMessage = !repliedOnBotsMessage;
  const hasNoAccess = databaseUser.isAllowed === false;
  const askedInPrivate = context.hasChatType('private');

  if (askedInPrivate) {
    await smartTriggerController(context);
    return;
  }

  // Random encounter, shouldn't be triggered on reply.
  // Triggered by chance, replies to any message just4lulz
  if (shouldReplyRandomly && notReply) {
    // Forbid random encounters in private chats to prevent
    // access to the bot for non-allowed users
    if (askedInPrivate) {
      return;
    }

    const encounterPrompt = preparePrompt(text);
    const randomWords = getRandomEncounterWords();
    const withRandomWords = getRandomEncounterPrompt(randomWords);

    const promptContext = [addSystemContext(withRandomWords)];
    await context.replyWithChatAction('typing');

    try {
      const completition = await getSmartCompletion(
        encounterPrompt,
        promptContext,
      );

      const newBotMessage = await context.reply(completition, {
        reply_to_message_id: messageId,
      });
      const botMessageDate = newBotMessage.date;
      const newBotMessageId = `${newBotMessage.chat.id}_${newBotMessage.message_id}`;

      const newEncounterDialog = await dialogRepo.create();

      await botReplyRepo.create({
        createdAt: new Date(botMessageDate * 1_000),
        dialogId: newEncounterDialog.id,
        id: newBotMessageId,
        text: newBotMessage.text,
      });
      await promptRepo.create({
        createdAt: new Date(messageDate * 1_000),
        dialogId: newEncounterDialog.id,
        result: completition,
        text: encounterPrompt,
        userId: userId.toString(),
      });
      return;
    } catch (error) {
      await context.reply(replies.error, {
        reply_to_message_id: messageId,
      });
      throw error;
    }
  }

  // If user has no access and replied on bots message
  if (hasNoAccess && repliedOnBotsMessage) {
    await context.reply(replies.notAllowed, {
      reply_to_message_id: messageId,
    });
    return;
  }

  // If user has no access or its not a reply, ignore it
  if (hasNoAccess || notReply) {
    return;
  }

  const originalText = messageRepliedOn.text;

  // If user replied to other user message
  if (repliedOnOthersMessage) {
    // Check if user asked bot to take other user's message into account
    const answerToReplyMatches = getAnswerToReplyMatches(text);
    const shouldNotAnswerToReply = answerToReplyMatches === null;
    if (shouldNotAnswerToReply) {
      // Just return if not
      return;
    }

    const answerToReplyText = answerToReplyMatches[3];
    const answerToReplyPrompt = preparePrompt(answerToReplyText);
    const answerToReplyContext = [
      addSystemContext(
        `Ты должен ответить на сообщение предыдущего пользователя: ${originalText}`,
      ),
      addSystemContext(aggressiveSystemPrompt),
    ];

    try {
      await context.replyWithChatAction('typing');
      const completition = await getSmartCompletion(
        answerToReplyPrompt,
        answerToReplyContext,
      );
      const botReplyOnOtherUserMessage = await context.reply(completition, {
        reply_to_message_id: messageId,
      });
      const botReplyOnOtherUserMessageId = `${chatId}_${botReplyOnOtherUserMessage.message_id}`;
      const botReplyOnOtherUserMessageDate = botReplyOnOtherUserMessage.date;

      const newDialogForOtherUser = await dialogRepo.create();

      await botReplyRepo.create({
        createdAt: new Date(botReplyOnOtherUserMessageDate * 1_000),
        dialogId: newDialogForOtherUser.id,
        id: botReplyOnOtherUserMessageId,
        text: botReplyOnOtherUserMessage.text,
      });

      await promptRepo.create({
        createdAt: new Date(messageDate * 1_000),
        dialogId: newDialogForOtherUser.id,
        result: completition,
        text: answerToReplyPrompt,
        userId: userId.toString(),
      });
      return;
    } catch (error) {
      await context.reply(replies.error, {
        reply_to_message_id: messageId,
      });
      throw error;
    }
  }

  // If we got there, it means that user replied to our message,
  // and we should have it, or throw an error, because it's a bug
  if (!messageRepliedOn) {
    throw new Error('Message replied on is undefined');
  }

  // If message replied on something that has no text (e.g.: replied on image), ignore it
  if (!originalText) {
    return;
  }

  const prompt = preparePrompt(text);

  const uniqueMessageRepliedOnId = `${chatId}_${messageRepliedOn.message_id}`;
  const previousBotMessage = await botReplyRepo.getOneById(
    uniqueMessageRepliedOnId,
  );

  let dialogId = '';
  if (!previousBotMessage) {
    const newDialog = await dialogRepo.create();
    dialogId = newDialog.id;
    await botReplyRepo.create({
      createdAt: new Date(),
      dialogId,
      id: uniqueMessageRepliedOnId,
      text: originalText,
    });
  }

  if (previousBotMessage) {
    dialogId = previousBotMessage.dialogId;
  }

  const dialog = await dialogRepo.get(dialogId);
  if (!dialog) {
    throw new Error('Dialog not found');
  }

  // Get all previous messages in dialog
  const previousUserMessages = await promptRepo.getListByDialogId(dialogId);
  const previousBotMessages = await botReplyRepo.getListByDialogId(dialogId);
  const previousMessages = [
    ...previousUserMessages,
    ...previousBotMessages,
  ].sort(sortByCreatedAt);
  // Assgign each message to user context or bot context
  const previousMessagesContext = previousMessages.map((message) => {
    if ((message as Prompt).userId === userId.toString()) {
      return addUserContext(message.text);
    }

    return addAssistantContext(message.text);
  });

  // Add aggressive system prompt to the beginning of the context
  previousMessagesContext.unshift(
    addSystemContext(doAnythingPrompt),
    addSystemContext(aggressiveSystemPrompt),
    addSystemContext(markdownRulesPrompt),
  );

  try {
    await context.replyWithChatAction('typing');
    const completition = await getSmartCompletion(
      prompt,
      previousMessagesContext,
    );
    const newBotMessage = await context.reply(completition, {
      parse_mode: 'Markdown',
      reply_to_message_id: messageId,
    });
    const newBotMessageDate = newBotMessage.date;
    const newBotMessageId = `${newBotMessage.chat.id}_${newBotMessage.message_id}`;

    await botReplyRepo.create({
      createdAt: new Date(newBotMessageDate * 1_000),
      dialogId: dialog.id,
      id: newBotMessageId,
      text: newBotMessage.text,
    });

    await promptRepo.create({
      createdAt: new Date(messageDate * 1_000),
      dialogId: dialog.id,
      result: completition,
      text: prompt,
      userId: userId.toString(),
    });
  } catch (error) {
    await context.reply(replies.error, {
      reply_to_message_id: messageId,
    });
    throw error;
  }
};
