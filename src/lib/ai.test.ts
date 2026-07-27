import assert from 'node:assert/strict';
import { it } from 'node:test';

/* eslint-disable node/no-process-env */
process.env.BOT_TOKEN = 'test';
process.env.GROK_API_KEY = 'test';
process.env.MISTRAL_API_KEY = 'test';
process.env.OPENAI_API_KEY = 'test';
/* eslint-enable node/no-process-env */

const webFetch: typeof fetch = async () =>
  new Response(
    JSON.stringify({
      id: 'response-id',
      object: 'response',
      output: [
        {
          content: [{ text: 'OK', type: 'output_text' }],
          id: 'message-id',
          role: 'assistant',
          status: 'completed',
          type: 'message',
        },
      ],
      status: 'completed',
    }),
    {
      headers: { 'content-type': 'application/json' },
      status: 200,
    },
  );

it('keeps using Web fetch when another SDK replaces the global fetch', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = webFetch;
  const [{ generateText }, { xai }] = await Promise.all([
    import('ai'),
    import('lib/ai.js'),
  ]);

  globalThis.fetch = (async () => {
    throw new Error('incompatible global fetch was used');
  }) as typeof fetch;

  try {
    const { text } = await generateText({
      model: xai('grok-3-mini'),
      prompt: 'Reply with exactly OK',
    });

    assert.equal(text, 'OK');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
