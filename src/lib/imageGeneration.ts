import { openrouter } from 'lib/ai.js';
import { settings } from 'lib/settings.js';

// eslint-disable-next-line canonical/id-match
export const base64ToImage = (base64: string) => {
  return Buffer.from(base64, 'base64');
};

export const generateImage = async (text: string) => {
  const response = await openrouter.chat.send({
    chatGenerationParams: {
      messages: [{ content: text, role: 'user' }],
      modalities: ['image'],
      model: settings.imageGenerationModel,
    },
  });

  const message = response.choices[0].message;
  if (!message.images?.length) return undefined;

  const dataUrl = message.images[0].imageUrl.url;
  const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
  return base64;
};
