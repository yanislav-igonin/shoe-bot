export const replies = {
  error:
    'Что-то пошло не так, возможно, ввод слишком большой или непонятный, попробуйте снова.' +
    '\n\nЕсли ошибка повторяется, напишите @hobo_with_a_hookah',
  help:
    'Есть несколько вариантов запроса:\n\n' +
    '1. *Ботинок, <текст>* - базовая модель, генерирует неплохие ответы, цензура отсутствует (text-davinchi-003).\n' +
    '2. *Барон ботинок, <текст>* - модель с цензурой, генерирует более грамотные ответы. Это именно сама ChatGPT (gpt-4).\n' +
    '3. *Граф ботинок, <текст>* - генерация картинок по запросу (DALL-E).',
  no: 'пидора ответ',
  noAnswer: 'У меня нет ответа на этот вопрос',
  notAllowed:
    'Пока доступно только Яну.\n\nЗалетай в канал https://t.me/milkmans_channel' +
    'чтобы следить за обновами. Или чернки в личку @hobo_with_a_hookah за доступом.',
  start:
    'Привет, я Ботинок.' +
    '\nГенерирую текст и картинки по запросу и отвечаю на любые вопросы.' +
    '\nНапиши мне что-нибудь, и я попробую ответить.' +
    '\n\nТакже работую в группах.' +
    '\n\n/help - для просмотра справки.',
  yes: 'пизда',
} as const;
