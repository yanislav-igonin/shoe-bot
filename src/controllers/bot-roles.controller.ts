import { type CommandContext } from 'grammy';
import { type BotContext } from 'lib/context';
import { replies } from 'lib/replies';
import { DateTime } from 'luxon';

export const botRolesController = async (
  context: CommandContext<BotContext>,
) => {
  const { user } = context.state;
  if (!user.allowedTill) {
    await context.reply(replies.notAllowed);
    return;
  }

  const beutifiedAllowedTill = DateTime.fromJSDate(user.allowedTill).toFormat(
    'dd.MM.yyyy',
  );
  await context.reply(replies.subscriptionInfo(beutifiedAllowedTill), {
    reply_to_message_id: context.message?.message_id,
  });
};
