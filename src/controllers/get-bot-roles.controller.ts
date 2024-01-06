import { type CommandContext } from 'grammy';
import { type BotContext } from 'lib/context';
import { database } from 'lib/database';

export const getBotRolesController = async (
  context: CommandContext<BotContext>,
) => {
  const botRoles = await database.botRole.findMany({ orderBy: { id: 'asc' } });
  const botRoleList = botRoles.map((botRole) => {
    return `${botRole.id} - ${botRole.name}`;
  });
  const reply = botRoleList.join('\n');
  await context.reply(reply);
};
