import { stats as statsRepo } from '@/repositories';
import { type CommandContext } from 'grammy';
import { type BotContext } from 'lib/context';

export const statsController = async (context: CommandContext<BotContext>) => {
  const [texts, photos, voices] = await Promise.all([
    statsRepo.getTextMessagesCountForLastMonthGroupedByUser(),
    statsRepo.getImageMessagesCountForLastMonthGroupedByUser(),
    statsRepo.getVoiceMessagesCountForLastMonthGroupedByUser(),
  ]);

  let text = 'Статистика за последний месяц:\n\n**Текст:**\n\n';
  for (const stat of texts) {
    const { firstName, lastName, messagesCount, username } = stat;
    const row = `${firstName} ${lastName} (@${username}): ${messagesCount}\n`;
    text += row;
  }

  text += '\n**Пикчи:**\n\n';
  for (const stat of photos) {
    const { firstName, lastName, messagesCount, username } = stat;
    const row = `${firstName} ${lastName} (@${username}): ${messagesCount}\n`;
    text += row;
  }

  text += '\n**Войсы:**\n\n';
  for (const stat of voices) {
    const { firstName, lastName, messagesCount, username } = stat;
    const row = `${firstName} ${lastName} (@${username}): ${messagesCount}\n`;
    text += row;
  }

  await context.reply(text, { parse_mode: 'Markdown' });
};
