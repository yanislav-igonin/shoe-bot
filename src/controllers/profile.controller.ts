import { type CommandContext } from 'grammy';
import { type BotContext } from 'lib/context.js';
import { getRemainingDailyRequests } from 'lib/dailyQuota.js';
import { replies } from 'lib/replies.js';
import { formatAllowedTill, isSubscriptionActive } from 'lib/subscription.js';

export const profileController = async (
  context: CommandContext<BotContext>,
) => {
  const { em, user } = context.state;
  const { allowedTill } = user;
  const subscriptionIsInactive = !isSubscriptionActive(allowedTill);

  if (subscriptionIsInactive) {
    const remaining = await getRemainingDailyRequests(em, user.id);
    await context.reply(replies.dailyQuotaInfo(remaining), {
      reply_to_message_id: context.message?.message_id,
    });
    return;
  }

  const beutifiedAllowedTill = formatAllowedTill(allowedTill);
  await context.reply(replies.subscriptionInfo(beutifiedAllowedTill), {
    reply_to_message_id: context.message?.message_id,
  });
};
