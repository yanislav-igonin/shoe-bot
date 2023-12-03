import { type Filter } from 'grammy';
import { type BotContext } from 'lib/context';

export const imageController = async (
  context: Filter<BotContext, 'message:photo'>,
) => {
  // const { user, chat } = context.state;
  const { message } = context;
  const { photo, caption } = message;
  await context.reply(caption ?? 'No caption');
  await context.reply(photo[0].file_id);
};
