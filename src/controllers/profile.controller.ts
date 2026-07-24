import { type CommandContext } from 'grammy';
import { type BotContext } from 'lib/context.js';
import { getRemainingDailyRequests } from 'lib/dailyQuota.js';
import { replies } from 'lib/replies.js';
import { DateTime } from 'luxon';

export const profileController = async (
  context: CommandContext<BotContext>,
) => {
  const { user } = context.state;
  const { allowedTill } = user;
  const subscriptionIsInactive =
    allowedTill === null ||
    DateTime.now().toUTC() >=
      DateTime.fromJSDate(allowedTill).toUTC().endOf('day');

  if (subscriptionIsInactive) {
    const remaining = await getRemainingDailyRequests(user.id);
    await context.reply(replies.dailyQuotaInfo(remaining), {
      reply_to_message_id: context.message?.message_id,
    });
    return;
  }

  const beutifiedAllowedTill =
    DateTime.fromJSDate(allowedTill).toFormat('dd.MM.yyyy');
  await context.reply(replies.subscriptionInfo(beutifiedAllowedTill), {
    reply_to_message_id: context.message?.message_id,
  });
};
