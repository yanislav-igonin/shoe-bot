/* eslint-disable node/no-process-env */
export const config = {
  botToken: process.env.BOT_TOKEN ?? '',
  openAiApiKey: process.env.OPENAI_API_KEY ?? '',
};
