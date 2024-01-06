import { type CommandContext } from 'grammy';
import { type BotContext } from 'lib/context';
import { database } from 'lib/database';
import { replies } from 'lib/replies';

export const setBotRoleController = async (
  context: CommandContext<BotContext>,
) => {
  const { userSettings } = context.state;
  const botRoleId = context.message?.text.split(' ')[1];
  if (!botRoleId) {
    await context.reply(replies.wrongBotRole);
    return;
  }

  const botRole = await database.botRole.findFirst({
    where: { id: Number.parseInt(botRoleId, 10) },
  });
  if (!botRole) {
    await context.reply(replies.wrongBotRole);
    return;
  }

  await database.userSettings.update({
    data: { botRoleId: Number.parseInt(botRoleId, 10) },
    where: { id: userSettings.id },
  });

  await context.reply(replies.botRoleChanged(botRole.name));
};
