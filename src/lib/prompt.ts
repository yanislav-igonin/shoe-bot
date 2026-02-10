import { type Message } from '@prisma/client';
import { openrouter } from 'lib/ai.js';
import { config, isProduction } from 'lib/config.js';
import { logger } from 'lib/logger.js';
import { randomEncounterWords } from 'lib/randomEncounterWords.js';
import { replies } from 'lib/replies.js';
import { settings } from 'lib/settings.js';

type ChatMessageContentItem =
  | { type: 'text'; text: string }
  | {
      type: 'image_url';
      imageUrl: { url: string; detail?: string };
    };

export type ChatCompletionRequestMessage =
  | {
      role: 'system';
      content: string;
      name?: string;
    }
  | {
      role: 'user';
      content: string | ChatMessageContentItem[];
      name?: string;
    }
  | {
      role: 'assistant';
      content?:
        | string
        | ChatMessageContentItem[]
        | null;
      name?: string;
    };

enum ContextRole {
  Assistant = 'assistant',
  System = 'system',
  User = 'user',
}

const chunkMessage = (message: string) => {
  const MAX_LENGTH = 4_000;
  const chunks = [];
  for (
    let index = 0;
    index < message.length;
    index += MAX_LENGTH
  ) {
    chunks.push(message.slice(index, index + MAX_LENGTH));
  }

  return chunks;
};

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
      content: [
        { text: message.text, type: 'text' },
        {
          imageUrl: { url: imagesMap[message.id] },
          type: 'image_url',
        },
      ],
      role: ContextRole.Assistant,
    };
  }

  if (message.tgPhotoId) {
    return {
      content: [
        {
          imageUrl: { url: imagesMap[message.id] },
          type: 'image_url',
        },
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
          imageUrl: {
            detail: 'high',
            url: imagesMap[message.id],
          },
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
          imageUrl: {
            detail: 'high',
            url: imagesMap[message.id],
          },
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
  (imagesMap: Record<number, string>) =>
  (message: Message) => {
    if (message.userId === config.botId) {
      return addAssistantContext(message, imagesMap);
    }

    return addUserContext(message, imagesMap);
  };

export const getCompletion = async (
  message: Message | string,
  context: ChatCompletionRequestMessage[] = [],
  model?: string,
) => {
  const resolvedModel = model ?? settings.mainModel;
  const userMessage = addUserContext(message);
  const messages = [...context, userMessage];
  // @ts-expect-error SDK Message type is not exported from main entry
  const response = await openrouter.chat.send({
    chatGenerationParams: {
      messages,
      model: resolvedModel,
    },
  });
  const text =
    response.choices[0].message?.content;
  return chunkMessage(
    (typeof text === 'string' ? text.trim() : '') ||
      replies.noAnswer,
  );
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
    const randomIndex = Math.floor(
      Math.random() * randomEncounterWords.length,
    );
    words.push(randomEncounterWords[randomIndex]);
  }

  return words;
};

export const shouldMakeRandomEncounter = () =>
  Math.random() < config.randomEncounterChance;

export const getRandomEncounterPrompt = (
  words: string[],
) =>
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
  const randomIndex = Math.floor(
    Math.random() * styles.length,
  );
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
  let description = (
    await getCompletion(
      prompt,
      [],
      settings.fastModel,
    )
  )[0];
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

  const withStyle =
    description + ' ' + getShictureStyle();
  return withStyle;
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
  const chooseTaskMessage =
    addSystemContext(chooseTaskPrompt);
  const userMessage = addUserContext(text);
  const messages = [chooseTaskMessage, userMessage];
  // @ts-expect-error SDK Message type is not exported from main entry
  const response = await openrouter.chat.send({
    chatGenerationParams: {
      messages,
      model: settings.fastModel,
      responseFormat: { type: 'json_object' },
    },
  });
  const task =
    response.choices[0].message?.content;
  try {
    const parsed = JSON.parse(
      (typeof task === 'string' ? task : null) ??
        '{}',
    ) as {
      task: 'image' | 'text';
    };
    return parsed.task;
  } catch (error) {
    logger.error(
      'Prompt: ChooseTask: Parsing answer from model:',
      task,
      error,
    );
    return 'text';
  }
};
