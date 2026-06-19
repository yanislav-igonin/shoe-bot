import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

/* eslint-disable node/no-process-env */
process.env.BOT_TOKEN = 'test';
process.env.GROK_API_KEY = 'test';
process.env.MISTRAL_API_KEY = 'test';
process.env.OPENAI_API_KEY = 'test';
/* eslint-enable node/no-process-env */

const { getGeneratedImageUrl } = await import('lib/imageGeneration.js');

describe('getGeneratedImageUrl', () => {
  it('returns first generated image URL', () => {
    const imageUrl = getGeneratedImageUrl({
      data: [{ url: 'https://example.com/image.png' }],
    });

    assert.equal(imageUrl, 'https://example.com/image.png');
  });

  it('returns undefined when response does not contain URL', () => {
    const imageUrl = getGeneratedImageUrl({ data: [{}] });

    assert.equal(imageUrl, undefined);
  });

  it('returns undefined when response URL is invalid', () => {
    const imageUrl = getGeneratedImageUrl({ data: [{ url: 'not-a-url' }] });

    assert.equal(imageUrl, undefined);
  });
});
