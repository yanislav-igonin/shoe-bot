import { BotRole } from '../entities.js';
import { type CommandContext } from 'grammy';
import { type BotContext } from 'lib/context.js';
import { replies } from 'lib/replies.js';

export const setBotRoleController = async (
  context: CommandContext<BotContext>,
) => {
  const { em, userSettings } = context.state;
  const botRoleId = context.message?.text.split(' ')[1];
  if (!botRoleId) {
    await context.reply(replies.wrongBotRole);
    return;
  }

  const botRole = await em.findOne(BotRole, {
    id: Number.parseInt(botRoleId, 10),
  });
  if (!botRole) {
    await context.reply(replies.wrongBotRole);
    return;
  }

  userSettings.botRole = botRole;
  await em.flush();

  await context.reply(replies.botRoleChanged(botRole.name));
};
