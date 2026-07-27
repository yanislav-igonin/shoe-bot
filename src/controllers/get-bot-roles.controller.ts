import { BotRole } from '../entities.js';
import { type CommandContext } from 'grammy';
import { type BotContext } from 'lib/context.js';

export const getBotRolesController = async (
  context: CommandContext<BotContext>,
) => {
  const botRoles = await context.state.em.find(
    BotRole,
    {},
    { orderBy: { id: 'asc' } },
  );
  const botRoleList = botRoles.map((botRole) => {
    return `${botRole.id} - ${botRole.name}`;
  });
  const reply = botRoleList.join('\n');
  await context.reply(reply);
};
