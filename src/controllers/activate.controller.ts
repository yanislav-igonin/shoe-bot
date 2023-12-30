import { type CommandContext } from 'grammy';
import { type BotContext } from 'lib/context';
import { database } from 'lib/database';
import { replies } from 'lib/replies';
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

  const activationCode = await database.activationCode.findUnique({
    where: {
      code,
    },
  });
  if (!activationCode || activationCode.usedByUserId) {
    await context.reply(replies.wrongActivationCode);
    return;
  }

  const { user } = context.state;
  const { allowedTill: userAllowedDate } = user;
  const newAllowedTill = getNewAllowedTill(userAllowedDate);

  await database.newUser.update({
    data: {
      allowedTill: newAllowedTill,
    },
    where: {
      id: user.id,
    },
  });
  await database.activationCode.update({
    data: {
      usedByUserId: user.id,
    },
    where: {
      id: activationCode.id,
    },
  });

  const beutifiedNewAllowedTill =
    DateTime.fromJSDate(newAllowedTill).toFormat('dd.MM.yyyy');
  await context.reply(replies.activationSuccess(beutifiedNewAllowedTill), {
    reply_to_message_id: context.message?.message_id,
  });
};
