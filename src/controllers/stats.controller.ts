import { stats as statsRepo } from '@/repositories';
import { type CommandContext } from 'grammy';
import { type BotContext } from 'lib/context';

export const statsController = async (context: CommandContext<BotContext>) => {
  const [promptsForLastMonth, imagesForLastMonth] = await Promise.all([
    statsRepo.getPromptsCountForLastMonthGroupedByUser(),
    statsRepo.getImagesCountForLastMonthGroupedByUser(),
  ]);

  let text = 'Статистика за последний месяц:\n\nПромты:\n\n';
  for (const stat of promptsForLastMonth) {
    const { firstName, lastName, promptsCount, username } = stat;
    const row = `${firstName} ${lastName} (@${username}): ${promptsCount}\n`;
    text += row;
  }

  text += '\nИзображения:\n\n';
  for (const stat of imagesForLastMonth) {
    const { firstName, lastName, imagesCount, username } = stat;
    const row = `${firstName} ${lastName} (@${username}): ${imagesCount}\n`;
    text += row;
  }

  await context.reply(text);
};