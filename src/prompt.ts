import { config, isProduction } from '@/config';
import { replies } from '@/replies';
import { Configuration, OpenAIApi } from 'openai';
import { randomEncounterWords } from 'randomEncounterWords';

const configuration = new Configuration({
  apiKey: config.openAiApiKey,
});
const openai = new OpenAIApi(configuration);

export const getCompletion = async (prompt: string) => {
  const response = await openai.createCompletion({
    max_tokens: 2_048,
    model: 'text-davinci-003',
    prompt,
  });
  const { text } = response.data.choices[0] as { text: string };
  return text.trim() || replies.noAnswer;
};

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

// Get random words from array
export const getRandomEncounterWords = () => {
  const words = [];
  for (let index = 0; index < 3; index++) {
    const randomIndex = Math.floor(Math.random() * randomEncounterWords.length);
    words.push(randomEncounterWords[randomIndex]);
  }

  return words;
};

export const joinWithReply = (originalText: string, text: string) =>
  'Мое предыдущие сообщение:\n' +
  originalText +
  '\n\nСообщение пользователя:\n' +
  text;

export const shouldMakeRandomEncounter = () =>
  Math.random() < config.randomEncounterChance;
