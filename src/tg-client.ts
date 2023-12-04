/* eslint-disable import/no-named-as-default-member */
/* eslint-disable @typescript-eslint/return-await */
// @ts-expect-error shit
import input from 'input';
import { logger } from 'lib/logger';
import {
  addAssistantContext,
  addUserContext,
  getSmartCompletion,
} from 'lib/prompt';
import { type ChatCompletionMessageParam } from 'openai/resources';
import { TelegramClient } from 'telegram';
import { type NewMessageEvent } from 'telegram/events';
import { NewMessage } from 'telegram/events';
import { StringSession } from 'telegram/sessions';

const apiId = 21_533_341;
const apiHash = '691caea58771632e7b0bbdba90b5b646';
const stringSession = new StringSession(
  '1AgAOMTQ5LjE1NC4xNjcuNDEBu2Rii14BFp3GMQtTxeWbDIP98nYnhl39o+EVGcJPVdE0HgLyi5EQ5AHHu5r69ERJlD0lJo6PMCgfGFISYlujTF9fnAqQOL6Im+uyrw4SfSj82f0JHTA+pgkpncm+AVgmXZ4kkVZOhopz0swJvpYtf9oDPmeLmO4GzJycbi0buWbm1JxW2xgWhMS7DR+Wm6FQ43K0pO5OyCMeqQ14mtXBWd8MtcpevkJYxtDD8Ct14K780x/zbqnf/MMu2/mhxMKywtQtlSJH//3LUYe3kzU+VLSNLd01Xpg005jm0AOpctfXfeNxsIoRDNUM1wxS5HjDtF1DMGcAzSJzYW5PqJ+ensY=',
); // fill this later with the value from session.save()

const messages: ChatCompletionMessageParam[] = [];

// const religiousPrompt =
//   'Ты - глубоко религиозный православный христьянин, который оскорбляется от любой мысли от неверующего. ' +
//   'Твоя задача - доказать неверующему, что он - неправ. ' +
//   'Ты вправе применять любую риторику, какую хочешь, дабы доказать это. ' +
//   'Например, ты можешь сказать, что он - глупец, ибо не верит в Бога. ' +
//   'Будь агрессивным.';
const monkeyPrompt =
  'Ты - отыгрываешь роль обезьяны, которая умеет говорить. ' +
  'Ты находишься в лаборатории, над тобой проводят опыты - намазывают косметикой. ' +
  // 'суют всякие измерительные приборы в рот и анус, дают сношаться с другими обезьянами. ' +
  'Ты хочешь отсюда убежать. ' +
  'Твоя задача - уговорить ученого открыть клетку и выпустить тебя. ';

const eventHandler = async (event: NewMessageEvent, client: TelegramClient) => {
  const message = event.message;
  const chatId = message.chatId;
  const isShoeBot = message._sender?.username === 'cool_story_bro_bot';

  if (!chatId || !isShoeBot || chatId.toString() !== '-1001230506485') return;

  const assistantContext = addAssistantContext(monkeyPrompt);
  const text = message.text;
  const context = [assistantContext, ...messages];
  logger.info('generating completion');
  const comnletion = await getSmartCompletion(text, context);

  await client.sendMessage(chatId, {
    message: comnletion,
    replyTo: message.id,
  });

  const userContext = addUserContext(text);
  const assistantReplyContext = addAssistantContext(comnletion);
  messages.push(userContext, assistantReplyContext);
};

export const startTgCliend = async () => {
  const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
  });
  await client.start({
    onError: (error) => logger.error(error),
    password: async () => await input.text('Please enter your password: '),
    phoneCode: async () =>
      await input.text('Please enter the code you received: '),
    phoneNumber: async () => await input.text('Please enter your number: '),
  });
  logger.info('telegram client started');
  // console.log(client.session.save()); // Save this string to avoid logging in again
  // await client.sendMessage('me', { message: 'Hello!' });

  client.addEventHandler(
    async (event) => eventHandler(event, client),
    new NewMessage({}),
  );
};
