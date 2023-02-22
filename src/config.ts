/* eslint-disable node/no-process-env */
export const config = {
  botToken: process.env.BOT_TOKEN ?? '',
  env: process.env.ENV ?? 'development',
  openAiApiKey: process.env.OPENAI_API_KEY ?? '',
};

export const isProduction = () => config.env === 'production';
