import { isProduction } from './config';

const triggeredBy = isProduction()
  ? ['Ботинок,', 'ботинок,', 'Shoe,', 'shoe,']
  : ['Бомж,', 'бомж,', 'Hobo,', 'hobo,'];
export const shouldBeIgnored = (text: string) => {
  return !triggeredBy.some((trigger) => text.startsWith(trigger));
};

export const getPrompt = (text: string) => {
  const found = triggeredBy.find((trigger) => text.startsWith(trigger));
  if (!found) {
    return text;
  }

  return text.slice(found.length).trim();
};

export const joinWithReply = (originalText: string, text: string) =>
  'Мое предыдущие сообщение:\n' +
  originalText +
  '\n\nСообщение пользователя:\n' +
  text;
