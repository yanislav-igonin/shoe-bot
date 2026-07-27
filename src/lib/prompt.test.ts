import { Message, MessageType, User } from '../entities.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

/* eslint-disable node/no-process-env */
process.env.BOT_TOKEN = 'test';
process.env.GROK_API_KEY = 'test';
process.env.OPENAI_API_KEY = 'test';
/* eslint-enable node/no-process-env */

const { addUserContext } = await import('lib/prompt.js');

const user = new User();
user.id = 1;
user.tgId = '1';

const message = new Message();
message.createdAt = new Date(0);
message.id = 1;
message.text = 'describe this';
message.tgMessageId = '1';
message.tgPhotoId = 'photo-id';
message.type = MessageType.image;
message.user = user;

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
