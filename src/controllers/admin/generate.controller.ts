import { type CommandContext } from 'grammy';
import { type BotContext } from 'lib/context';
import { database } from 'lib/database';

export const generateController = async (
  context: CommandContext<BotContext>,
) => {
  const newActivationCode = await database.activationCode.create({ data: {} });
  const code = newActivationCode.code;
  await context.reply(`Activation code:`);
  await context.reply(code);
};
