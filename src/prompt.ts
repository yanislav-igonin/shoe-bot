import { openai } from '@/ai';
import { config, isProduction } from '@/config';
import { replies } from '@/replies';
import { randomEncounterWords } from 'randomEncounterWords';

export const smartTextTriggerRegexp = isProduction()
  ? /((барон ботинок,|baron shoe,) )(.+)/isu
  : /((барон бомж,|baron hobo,) )(.+)/isu;

export const getCompletion = async (prompt: string) => {
  const response = await openai.createCompletion({
    max_tokens: 2_048,
    model: 'text-davinci-003',
    prompt,
  });
  const { text } = response.data.choices[0] as { text: string };
  return text.trim() || replies.noAnswer;
};

export const getSmartCompletion = async (prompt: string) => {
  const response = await openai.createChatCompletion({
    messages: [
      {
        content: prompt,
        role: 'user',
      },
    ],
    model: 'gpt-4',
  });
  const text = response.data.choices[0].message?.content;
  return text?.trim() ?? replies.noAnswer;
};

export const textTriggerRegexp = isProduction()
  ? /((ботинок,|shoe,) )(.+)/isu
  : /((бомж,|hobo,) )(.+)/isu;

const cleanPrompt = (text: string) => {
  return text.trim();
};

export const preparePrompt = (text: string) => {
  return cleanPrompt(text);
};

// Get random words from array
export const getRandomEncounterWords = () => {
  const words = [];
  const howMany = Math.floor(Math.random() * 5) + 1;
  for (let index = 0; index < howMany; index++) {
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
