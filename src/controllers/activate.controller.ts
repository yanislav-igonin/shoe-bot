import { ActivationCode } from '../entities.js';
import { type CommandContext } from 'grammy';
import { type BotContext } from 'lib/context.js';
import { replies } from 'lib/replies.js';
import { DateTime } from 'luxon';

const getNewAllowedTill = (userAllowedTill: Date | null) => {
  const now = DateTime.now().toUTC();
  if (!userAllowedTill) {
    return now.plus({ month: 1 }).toJSDate();
  }

  const subscriptionIsExpired = now > DateTime.fromJSDate(userAllowedTill);
  if (subscriptionIsExpired) {
    return now.plus({ month: 1 }).toJSDate();
  }

  return DateTime.fromJSDate(userAllowedTill).plus({ month: 1 }).toJSDate();
};

export const activateController = async (
  context: CommandContext<BotContext>,
) => {
  const code = context.message?.text.split(' ')[1];
  if (!code) {
    await context.reply(replies.wrongActivationCode);
    return;
  }

  const { em, user } = context.state;
  const activationCode = await em.findOne(ActivationCode, { code });
  if (!activationCode || activationCode.usedByUser) {
    await context.reply(replies.wrongActivationCode);
    return;
  }

  const { allowedTill: userAllowedDate } = user;
  const newAllowedTill = getNewAllowedTill(userAllowedDate);

  user.allowedTill = newAllowedTill;
  activationCode.usedByUser = user;
  await em.flush();

  const beutifiedNewAllowedTill =
    DateTime.fromJSDate(newAllowedTill).toFormat('dd.MM.yyyy');
  await context.reply(replies.activationSuccess(beutifiedNewAllowedTill), {
    reply_to_message_id: context.message?.message_id,
  });
};
