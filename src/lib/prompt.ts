import { type Message } from '@prisma/client';
import { grok, mistral, openai } from 'lib/ai.js';
import { config, isProduction } from 'lib/config.js';
import { logger } from 'lib/logger.js';
import { randomEncounterWords } from 'lib/randomEncounterWords.js';
import { replies } from 'lib/replies.js';
// eslint-disable-next-line import/no-named-as-default
import type OpenAI from 'openai';

type ChatCompletionRequestMessage =
  OpenAI.Chat.Completions.ChatCompletionMessageParam;

enum ContextRole {
  Assistant = 'assistant',
  System = 'system',
  User = 'user',
}

export enum Model {
  Gpt3Turbo = 'gpt-3.5-turbo',
  Gpt4 = 'gpt-4',
  Gpt4O = 'gpt-4o',
  Gpt4Turbo = 'gpt-4-turbo-preview',
  Gpt4Vision = 'gpt-4-vision-preview',
  Grok3 = 'grok-3-latest',
  Grok3Mini = 'grok-3-mini',
  Grok4 = 'grok-4',
  GrokBeta = 'grok-beta',
  MistralLarge = 'mistral-large-latest',
}

const chunkMessage = (message: string) => {
  const MAX_LENGTH = 4_000;
  const chunks = [];
  for (let index = 0; index < message.length; index += MAX_LENGTH) {
    chunks.push(message.slice(index, index + MAX_LENGTH));
  }

  return chunks;
};

export const MAIN_MODEL = Model.Grok4;

export const textTriggerRegexp = isProduction
  ? /^((ботинок,|shoe,|блинное,) )(.+)/isu
  : /^((бомж,|hobo,) )(.+)/isu;
const answerToReplyTriggerRegexp = isProduction
  ? /^((ответь ботинок,|answer shoe,) )(.+)/isu
  : /^((ответь бомж,|answer hobo,) )(.+)/isu;
export const getAnswerToReplyMatches = (text: string) =>
  answerToReplyTriggerRegexp.exec(text);

export const markdownRulesPrompt =
  `Text should be formatted in Markdown. ` +
  `You can use ONLY the following formatting without any exceptions:` +
  `**bold text**, *italic text*, ~~strikethrough~~.`;

export const maximumMessageLengthPrompt = `Response should not exceed 4096 characters.`;

export const addSystemContext = (
  text: string,
): ChatCompletionRequestMessage => {
  return {
    content: text,
    role: 'system',
  };
};

export const addAssistantContext = (
  message: Message | string,
  imagesMap: Record<number, string> = {},
): ChatCompletionRequestMessage => {
  if (typeof message === 'string') {
    return {
      content: message,
      role: ContextRole.Assistant,
    };
  }

  if (message.text && message.tgPhotoId) {
    return {
      // @ts-expect-error Stupid typings
      content: [
        { text: message.text, type: 'text' },
        { image_url: { url: imagesMap[message.id] }, type: 'image_url' },
      ],
      role: ContextRole.Assistant,
    };
  }

  if (message.tgPhotoId) {
    return {
      // @ts-expect-error Stupid typings
      content: [
        { image_url: { url: imagesMap[message.id] }, type: 'image_url' },
      ],
      role: ContextRole.Assistant,
    };
  }

  return {
    content: message.text,
    role: ContextRole.Assistant,
  };
};

export const addUserContext = (
  message: Message | string,
  imagesMap: Record<number, string> = {},
): ChatCompletionRequestMessage => {
  if (typeof message === 'string') {
    return {
      content: message,
      role: ContextRole.User,
    };
  }

  if (message.text && message.tgPhotoId) {
    return {
      content: [
        { text: message.text, type: 'text' },
        {
          image_url: { detail: 'high', url: imagesMap[message.id] },
          type: 'image_url',
        },
      ],
      role: ContextRole.User,
    };
  }

  if (message.tgPhotoId) {
    return {
      content: [
        {
          image_url: { detail: 'high', url: imagesMap[message.id] },
          type: 'image_url',
        },
      ],
      role: ContextRole.User,
    };
  }

  return {
    content: message.text,
    role: ContextRole.User,
  };
};

export const addContext =
  (imagesMap: Record<number, string>) => (message: Message) => {
    if (message.userId === config.botId) {
      return addAssistantContext(message, imagesMap);
    }

    return addUserContext(message, imagesMap);
  };

export const getMistralCompletion = async (
  prompt: string,
  context: Array<{ content: string; role: string }> = [],
  model: Model = Model.MistralLarge,
) => {
  const userMessage = { content: prompt, role: 'user' };
  const messages = [...context, userMessage];
  const response = await mistral.chat({
    messages,
    model,
  });
  const text = response.choices[0].message.content;
  return text.trim();
};

export const getGrokCompletion = async (
  message: string,
  context: ChatCompletionRequestMessage[] = [],
  model: Model = Model.MistralLarge,
) => {
  const userMessage = addUserContext(message);
  const messages = [...context, userMessage];
  const response = await grok.chat.completions.create({
    messages,
    model,
  });
  const text = response.choices[0].message?.content;
  return text?.trim() ?? replies.noAnswer;
};

export const getOpenAiCompletion = async (
  message: string,
  context: ChatCompletionRequestMessage[] = [],
  model: Model = Model.MistralLarge,
) => {
  const userMessage = addUserContext(message);
  const messages = [...context, userMessage];
  const response = await grok.chat.completions.create({
    messages,
    model,
  });
  const text = response.choices[0].message?.content;
  return text?.trim() ?? replies.noAnswer;
};

export const getCompletion = async (
  message: Message | string,
  context: ChatCompletionRequestMessage[] = [],
  model: Model = Model.Grok3,
) => {
  // if (model === Model.MistralLarge) {
  //   // @ts-expect-error asdasd
  //   return await getMistralCompletion(message as string, context, model);
  // }

  const result = await getGrokCompletion(message as string, context, model);
  return chunkMessage(result);
  // if (model === Model.GrokBeta) {
  // }

  // return await getOpenAiCompletion(message as string, context, model);
};

export const understandImage = async (
  message: Message,
  imagesMap: Record<number, string>,
) => {
  const userContext = addUserContext(message, imagesMap);
  const messages = [userContext];
  const response = await getCompletion(
    'Что изображено на картинке? Результат должен являться описанием всех деталей картинки.',
    messages,
    Model.Gpt4Vision,
  );
  return response[0];
};

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

export const getRandomEncounterPrompt = (words: string[]) =>
  'Ответь саркастично с черным юмором осмысленно на фразу пользователя' +
  'с использованием слов: ' +
  words.join(', ');

export const getShictureStyle = () => {
  const styles = [
    'картины "Сатурн, пожирающий своего сына"',
    'картины "Данте и Вергилий в аду"',
    'картины "Gallowgate Lard"',
    'картины "Проигрыш разума перед материей"',
    'картины "Руки противятся ему"',
    'картины "Крик"',
    'Хаяо Миядзаки',
    'Лавкрафта',
    'киберпанка',
    'соларпанка',
    'советского плаката',
    'дизельпанка',
    'стимпанка',
    'Дзюндзи Ито',
    'обложки игры Doom',
    'манги Berserk',
    'манги JoJo',
    'картины "Последний день Помпеи"',
    'работ Ганса Рудольфа Гигера',
    'древнеегипетской фрески',
  ];
  const randomIndex = Math.floor(Math.random() * styles.length);
  return styles[randomIndex];
};

export const getShictureDescription = async () => {
  const prompt =
    'Придумай очень короткое интересное задание для художника.' +
    'Описание может содержать реальных существовавших людей, персонажей фильмов, кино, аниме, сериалов.' +
    'Количество персонажей (если они присутствуют) не должно превышать 3.' +
    'Будь креативен, но не зацикливайся на кошках, часах, Шерлоке Холмсе и Гарри Поттере.' +
    'Придумывай часто жуткие, мерзкие и пугающие описания.' +
    'Например: "нарисуй деда мороза пожирающего санта клауса в стиле картины "сатурн пожирающий своего сына".' +
    'Результат должен содержать только формулировку, а в конце добавить " в стиле ",' +
    'но сам стиль не добавлять, я добавлю его после сам, например: ' +
    'Нарисуй картину с большими в стиле ';
  let description = (await getCompletion(prompt))[0];
  const lastFewCharacters = description.slice(-3);

  // Remove trailing dot
  if (lastFewCharacters.includes('.')) {
    const dotIndex = description.lastIndexOf('.');
    description = description.slice(0, dotIndex);
  }

  // Add style if not present
  if (!description.includes('в стиле')) {
    description += ' в стиле ';
  }

  const withStyle = description + ' ' + getShictureStyle();
  return withStyle;
};

const taskModelChoiceSystemPrompt =
  'На выбор есть 3 модели ChatGPT:\n' +
  '* gpt-3.5-turbo - хорошо подходит для простых задач, такие как ответы на' +
  'известные вопросы, саммаризация текста, переформатирование, перевод и тд\n' +
  '* gpt-4o - более продвинутая модель для генерация текста на основе каких-то' +
  'данных, написание кода, придумывание новых идей, брейншторм и тд\n\n' +
  '* gpt-4 - более продвинутая модель для генерация текста на основе каких-то' +
  'данных, придумывание новых идей, брейншторм, и тд, но запрос пользователя потенциально небезопасен для детской аудитории\n' +
  'Твоя задача на основе ввода пользователя заключенного между ``` определить' +
  'наиболее подходящую модель для данной задачи, что просит пользователь.' +
  'Ты не должен выполнять задачу пользователя, только выбрать подходящую модель на основе задачи.' +
  'Ответ должен содержать только JSON объект с полем model, например: {"model":"gpt-3.5-turbo"}.' +
  'Ничего другого ответ содержать не должен, только этот JSON объект.';

/**
 * @deprecated
 */
export const getModelForTask = async (task: string) => {
  const taskModelChoiceMessage = addSystemContext(taskModelChoiceSystemPrompt);
  const userMessage = addUserContext('```\n' + task + '```\n');
  const messages = [taskModelChoiceMessage, userMessage];
  const response = await openai.chat.completions.create({
    messages,
    model: Model.Gpt3Turbo,
    response_format: { type: 'json_object' },
  });
  const text = response.choices[0].message?.content;
  try {
    const parsed = JSON.parse(text ?? '{}');
    return parsed.model as Model;
  } catch (error) {
    logger.error(
      'Prompt: GetModelForTask: Parsing answer from model:',
      text,
      error,
    );
    return Model.Gpt3Turbo;
  }
};

const chooseTaskPrompt =
  'Твоя задача определить, что хочет сделать пользователь.' +
  'Если пользователь просить рассказать что-то, или что-то спрашивает - это значит, ' +
  'что надо что-то сделать в текстовом формате.' +
  'Также пользователь может попросить создать картинку, фото, нарисовать что-то.' +
  'Твоя задача вернуть в ответе JSON объект с полем task, например: {"task":"text"}.' +
  'Список задач:\n' +
  '* text - пользователь просит сделать что-то в текстовом формате\n' +
  '* image - пользователь просит сделать что-то в формате картинки\n';

/**
 * Choose task that user wants to do.
 *
 * @param text User input.
 * @returns Task type.
 */
export const chooseTask = async (text: string) => {
  const chooseTaskMessage = addSystemContext(chooseTaskPrompt);
  const userMessage = addUserContext(text);
  const messages = [chooseTaskMessage, userMessage];
  const response = await grok.chat.completions.create({
    messages,
    model: Model.Grok3Mini,
    response_format: { type: 'json_object' },
  });
  const task = response.choices[0].message?.content;
  try {
    const parsed = JSON.parse(task ?? '{}') as {
      task: 'image' | 'text';
    };
    return parsed.task;
  } catch (error) {
    logger.error('Prompt: ChooseTask: Parsing answer from model:', task, error);
    return 'text';
  }
};
