import { config } from './config';
import { replies } from './replies';
import { Configuration, OpenAIApi } from 'openai';

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
  const { text } = response.data.choices[0];
  return text?.trim() ?? replies.error; // just in case if text is undefined
};
