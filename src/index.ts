import {
  adminMiddleware,
  chatMiddleware,
  dialogMiddleware,
  stateMiddleware,
  userMiddleware,
} from '@/middlewares';
import {
  activateController,
  generateController,
  profileController,
  // imageController,
  shictureController,
  statsController,
  textController,
  textTriggerController,
} from 'controllers';
import { Bot } from 'grammy';
import { config } from 'lib/config';
import { type BotContext } from 'lib/context';
import { database } from 'lib/database';
import { logger } from 'lib/logger';
import { textTriggerRegexp } from 'lib/prompt';
import { replies } from 'lib/replies';

const bot = new Bot<BotContext>(config.botToken);

bot.catch((error) => {
  // @ts-expect-error Property 'response' does not exist on type '{}'.ts(2339)
  if (error.error?.response?.data?.error) {
    // @ts-expect-error Property 'response' does not exist on type '{}'.ts(2339)
    logger.error(error.error?.response?.data?.error.message);
    return;
  }

  logger.error(error);
});

bot.use(stateMiddleware);
bot.use(chatMiddleware);
bot.use(dialogMiddleware);
bot.use(userMiddleware);

bot.command('start', async (context) => {
  await context.reply(replies.start);
});
bot.command('help', async (context) => {
  await context.reply(replies.help, { parse_mode: 'Markdown' });
});
bot.command('shicture', shictureController);
bot.command('activate', activateController);
bot.command('profile', profileController);
bot.command('stats', adminMiddleware, statsController);
bot.command('generate', adminMiddleware, generateController);

const yesTriggerRegexp = /^да$/iu;
bot.hears(yesTriggerRegexp, async (context) => {
  const { message } = context;
  if (!message) {
    return;
  }

  const { message_id: replyToMessageId } = message;

  await context.reply(replies.yes, { reply_to_message_id: replyToMessageId });
});

const noTriggerRegexp = /^нет$/iu;
bot.hears(noTriggerRegexp, async (context) => {
  const { message } = context;
  if (!message) {
    return;
  }

  const { message_id: replyToMessageId } = message;

  await context.reply(replies.no, { reply_to_message_id: replyToMessageId });
});

/**
 * Handling gpt-4 requests.
 */
bot.on('message:text').hears(textTriggerRegexp, textTriggerController);

/**
 * For handling replies, private messages and random encounters
 */
bot.on('message:text', textController);
// bot.on('message:photo', imageController);

const start = async () => {
  await database.$connect();
  logger.info('database connected');
  // eslint-disable-next-line promise/prefer-await-to-then
  bot.start().catch(async (error) => {
    logger.error(error);
    await database.$disconnect();
  });
};

start()
  .then(() => logger.info('bot started'))
  .catch(logger.error);
