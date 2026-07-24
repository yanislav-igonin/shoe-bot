import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

/* eslint-disable node/no-process-env */
process.env.BOT_TOKEN = 'test';
process.env.GROK_API_KEY = 'test';
process.env.MISTRAL_API_KEY = 'test';
process.env.OPENAI_API_KEY = 'test';
process.env.TOGETHER_API_KEY = 'test';
/* eslint-enable node/no-process-env */

const {
  getGeneratedImageUrl,
  parseImageGenerationSettings,
  requireTogetherApiKey,
} = await import('lib/imageGeneration.js');

describe('requireTogetherApiKey', () => {
  it('returns a configured key', () => {
    assert.equal(requireTogetherApiKey('test-key'), 'test-key');
  });

  it('rejects a missing key', () => {
    assert.throws(
      () => requireTogetherApiKey(undefined),
      /TOGETHER_API_KEY is not set/u,
    );
  });

  it('rejects an empty key', () => {
    assert.throws(
      () => requireTogetherApiKey(''),
      /TOGETHER_API_KEY is not set/u,
    );
  });

  it('rejects a whitespace-only key', () => {
    assert.throws(
      () => requireTogetherApiKey('   '),
      /TOGETHER_API_KEY is not set/u,
    );
  });
});

describe('parseImageGenerationSettings', () => {
  it('parses Together settings', () => {
    assert.deepEqual(
      parseImageGenerationSettings([
        { key: 'imageProvider', value: 'togetherai' },
        {
          key: 'imageModel',
          value: 'black-forest-labs/FLUX.2-dev',
        },
      ]),
      {
        model: 'black-forest-labs/FLUX.2-dev',
        provider: 'togetherai',
      },
    );
  });

  it('parses xAI settings', () => {
    assert.deepEqual(
      parseImageGenerationSettings([
        { key: 'imageProvider', value: 'xai' },
        { key: 'imageModel', value: 'grok-imagine-image-quality' },
      ]),
      {
        model: 'grok-imagine-image-quality',
        provider: 'xai',
      },
    );
  });

  it('rejects a missing image provider', () => {
    assert.throws(
      () =>
        parseImageGenerationSettings([{ key: 'imageModel', value: 'model' }]),
      /imageProvider setting is missing/u,
    );
  });

  it('rejects a missing image model', () => {
    assert.throws(
      () =>
        parseImageGenerationSettings([
          { key: 'imageProvider', value: 'togetherai' },
        ]),
      /imageModel setting is missing/u,
    );
  });

  it('rejects an empty image model', () => {
    assert.throws(
      () =>
        parseImageGenerationSettings([
          { key: 'imageProvider', value: 'togetherai' },
          { key: 'imageModel', value: '   ' },
        ]),
      /imageModel setting is empty/u,
    );
  });

  it('rejects an unsupported image provider', () => {
    assert.throws(
      () =>
        parseImageGenerationSettings([
          { key: 'imageProvider', value: 'unknown' },
          { key: 'imageModel', value: 'model' },
        ]),
      /Unsupported image provider: unknown/u,
    );
  });
});

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
