import { config } from '@/config';
import { database } from '@/database';
import { logger } from '@/logger';
import {
  adminMiddleware,
  chatMiddleware,
  stateMiddleware,
  userMiddleware,
} from '@/middlewares';
import { smartTextTriggerRegexp, textTriggerRegexp } from '@/prompt';
import { replies } from '@/replies';
import { type BotContext } from 'context';
import {
  retardTriggerController,
  shictureController,
  smartTriggerController,
  statsController,
  textController,
} from 'controllers';
import { Bot } from 'grammy';

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

bot.use(chatMiddleware);
bot.use(stateMiddleware);
bot.use(userMiddleware);

bot.command('start', async (context) => {
  await context.reply(replies.start);
});

bot.command('help', async (context) => {
  await context.reply(replies.help, { parse_mode: 'Markdown' });
});

bot.command('shicture', shictureController);

bot.command('stats', adminMiddleware, statsController);

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
bot.hears(smartTextTriggerRegexp, smartTriggerController);

/**
 * Handling text-davinci-003 requests.
 */
bot.hears(textTriggerRegexp, retardTriggerController);

/**
 * For handling replies, private messages and random encounters
 */
bot.on('message:text', textController);

/**
 * Admin commands.
 */

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
