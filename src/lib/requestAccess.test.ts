import { classifyRequest } from './requestAccess.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const baseInput = {
  chatType: 'group',
  isReplyToThisBot: false,
  matchesTextTrigger: false,
  text: 'обычное сообщение',
};

describe('classifyRequest', () => {
  it('passes service commands for free', () => {
    assert.equal(
      classifyRequest({
        ...baseInput,
        text: '/profile',
      }),
      'free',
    );
  });

  it('classifies private text as generation', () => {
    assert.equal(
      classifyRequest({
        ...baseInput,
        chatType: 'private',
      }),
      'generation',
    );
  });

  it('classifies a group trigger as generation', () => {
    assert.equal(
      classifyRequest({
        ...baseInput,
        matchesTextTrigger: true,
      }),
      'generation',
    );
  });

  it('classifies a reply to this bot as generation', () => {
    assert.equal(
      classifyRequest({
        ...baseInput,
        isReplyToThisBot: true,
      }),
      'generation',
    );
  });

  it('classifies shicture as generation', () => {
    assert.equal(
      classifyRequest({
        ...baseInput,
        text: '/shicture',
      }),
      'generation',
    );
  });

  it('ignores unrelated group text', () => {
    assert.equal(classifyRequest(baseInput), 'ignore');
  });

  it('ignores a reply to another bot', () => {
    assert.equal(
      classifyRequest({
        ...baseInput,
        isReplyToThisBot: false,
      }),
      'ignore',
    );
  });
});
