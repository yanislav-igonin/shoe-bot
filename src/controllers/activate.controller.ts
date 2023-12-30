import { type CommandContext } from 'grammy';
import { type BotContext } from 'lib/context';
import { database } from 'lib/database';
import { replies } from 'lib/replies';
import { DateTime } from 'luxon';

const getNewAllowedTill = (userAllowedDate: Date | null) => {
  let newAllowedTill: Date;

  const now = DateTime.now();
  if (userAllowedDate) {
    if (now > DateTime.fromJSDate(userAllowedDate)) {
      newAllowedTill = now.plus({ month: 1 }).toJSDate();
    } else {
      newAllowedTill = DateTime.fromJSDate(userAllowedDate)
        .plus({ month: 1 })
        .toJSDate();
    }
  } else {
    newAllowedTill = now.plus({ month: 1 }).toJSDate();
  }

  return newAllowedTill;
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
  const userAllowedDate = user.allowedTill;
  const newAllowedTill = DateTime.fromJSDate(getNewAllowedTill(userAllowedDate))
    .toUTC()
    .endOf('day')
    .toJSDate();

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
  await context.reply(replies.activationSuccess(beutifiedNewAllowedTill));
};
