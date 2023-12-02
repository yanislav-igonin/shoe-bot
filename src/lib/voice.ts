import { openai } from 'lib/ai';
import { InputFile } from 'grammy';

export const generateVoice = async (text: string) => {
  const response = await openai.audio.speech.create({
    input: text,
    model: 'tts-1',
    response_format: 'mp3',
    voice: 'fable',
  });
  return new InputFile(
    await response.arrayBuffer().then((buffer) => Buffer.from(buffer)),
  );
};
