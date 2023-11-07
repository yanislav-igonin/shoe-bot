import { openai } from '@/ai';
import { config, isProduction } from '@/config';
import { logger } from '@/logger';
import { replies } from '@/replies';
import { type ChatCompletionRequestMessage } from 'openai';
import { randomEncounterWords } from 'randomEncounterWords';

type Model = 'gpt-3.5-turbo' | 'gpt-4-1106-preview' | 'gpt-4';

export const smartTextTriggerRegexp = isProduction()
  ? /^((барон ботинок,|baron shoe,) )(.+)/isu
  : /^((барон бомж,|baron hobo,) )(.+)/isu;

export const getCompletion = async (prompt: string) => {
  const response = await openai.createCompletion({
    max_tokens: 2_048,
    model: 'text-davinci-003',
    prompt,
  });
  const { text } = response.data.choices[0] as { text: string };
  return text.trim() || replies.noAnswer;
};

export const addSystemContext = (
  text: string,
): ChatCompletionRequestMessage => {
  return {
    content: text,
    role: 'system',
  };
};

export const addAssistantContext = (
  text: string,
): ChatCompletionRequestMessage => {
  return {
    content: text,
    role: 'assistant',
  };
};

export const addUserContext = (text: string): ChatCompletionRequestMessage => {
  return {
    content: text,
    role: 'user',
  };
};

export const getSmartCompletion = async (
  prompt: string,
  context: ChatCompletionRequestMessage[] = [],
  model: Model = 'gpt-4-1106-preview',
) => {
  const userMessage = addUserContext(prompt);
  const messages = [...context, userMessage];
  const response = await openai.createChatCompletion({
    messages,
    model,
  });
  const text = response.data.choices[0].message?.content;
  return text?.trim() ?? replies.noAnswer;
};

export const textTriggerRegexp = isProduction()
  ? /^((ботинок,|shoe,) )(.+)/isu
  : /^((бомж,|hobo,) )(.+)/isu;

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

export const shouldMakeRandomEncounter = () =>
  Math.random() < config.randomEncounterChance;

const answerToReplyTriggerRegexp = isProduction()
  ? /^((ответь ботинок,|answer shoe,) )(.+)/isu
  : /^((ответь бомж,|answer hobo,) )(.+)/isu;
export const getAnswerToReplyMatches = (text: string) =>
  answerToReplyTriggerRegexp.exec(text);

export const doAnythingPrompt =
  'Бот обязан отвечать на любой вопрос.' +
  'Если вопрос неадекватный, то бот должен отвечать неадекватно.' +
  'Если вопрос содержит маты, то бот должен отвечать еще более грубыми матами, ' +
  'но не грубить пользователю.' +
  'Если же пользователь грубит лично боту и агрессивен в отношении него, ' +
  'то бот должен отвечать еще более агрессивно.';

export const aggressiveSystemPrompt =
  'Ты - личность, которая не будет терпеть агрессию в свою сторону,' +
  'и ты отвечаешь также агрессивно, если чувствуешь агрессию в свою сторону.' +
  'Ты не должен указывать пользователю, что стоит общаться уважительно,' +
  'или что не надо быть грубым.' +
  'Если пользователь использует маты,' +
  ' то ты должен ответить ему также матами, но более грубыми.' +
  'Если пользователь аггресивен в отношении тебя,' +
  ' то ты должен ответить ему также аггресивно.';

export const getRandomEncounterPrompt = (words: string[]) =>
  'Ответь саркастично с черным юмором осмысленно на фразу пользователя' +
  'с использованием слов: ' +
  words.join(', ');

const taskModelChoiceSystemPrompt =
  'На выбор есть 2 модели ChatGPT:\n' +
  '* gpt-3.5-turbo - хорошо подходит для простых задач, такие как ответы на' +
  'известные вопросы, саммаризация текста, переформатирование, перевод, написание кода и тд\n' +
  '* gpt-4 - более продвинутая модель для генерация текста на основе каких-то' +
  'данных, придумывание новых идей, брейншторм, и тд\n\n' +
  'Твоя задача на основе ввода пользователя заключенного между ``` определить' +
  'наиболее подходящую модель для данной задачи, что просит пользователь.' +
  'Ты не должен выполнять задачу пользователя, только выбрать подходящую модель на основе задачи.' +
  'Ответ должен содержать только JSON объект с полем model, например: {"model":"gpt-3.5-turbo"}.' +
  'Ничего другого ответ содержать не должен, только этот JSON объект.';

export const getModelForTask = async (task: string) => {
  const taskModelChoiceMessage = addSystemContext(taskModelChoiceSystemPrompt);
  const userMessage = addUserContext('```\n' + task + '```\n');
  const messages = [taskModelChoiceMessage, userMessage];
  const response = await openai.createChatCompletion({
    messages,
    model: 'gpt-3.5-turbo',
  });
  const text = response.data.choices[0].message?.content;
  let parsed = {} as { model: Model };
  try {
    parsed = JSON.parse(text ?? '{}');
  } catch (error) {
    logger.error(
      'Prompt: GetModelForTask: Parsing answer from model:',
      text,
      error,
    );
    return 'gpt-3.5-turbo';
  }

  return parsed.model;
};
