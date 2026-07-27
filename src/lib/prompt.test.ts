import { type Message, MessageType } from '@prisma/client';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

/* eslint-disable node/no-process-env */
process.env.BOT_TOKEN = 'test';
process.env.GROK_API_KEY = 'test';
process.env.OPENAI_API_KEY = 'test';
/* eslint-enable node/no-process-env */

const { addUserContext } = await import('lib/prompt.js');

const message: Message = {
  createdAt: new Date(0),
  dialogId: 1,
  id: 1,
  replyToId: null,
  text: 'describe this',
  tgMessageId: '1',
  tgPhotoId: 'photo-id',
  tgVoiceId: null,
  type: MessageType.image,
  userId: 1,
};

describe('addUserContext', () => {
  it('converts a Telegram image message to AI SDK content', () => {
    assert.deepEqual(
      addUserContext(message, {
        [message.id]: 'https://example.com/image.jpg',
      }),
      {
        content: [
          { text: 'describe this', type: 'text' },
          {
            image: new URL('https://example.com/image.jpg'),
            type: 'image',
          },
        ],
        role: 'user',
      },
    );
  });
});
