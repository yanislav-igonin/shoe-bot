import { type BotContext } from './lib/context.js';
import { type EntityManager } from '@mikro-orm/postgresql';
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

/* eslint-disable node/no-process-env */
process.env.ADMINS_USERNAMES = '';
process.env.BOT_TOKEN = 'test';
process.env.DATABASE_URL =
  'postgresql://postgres:postgres@localhost/shoe_bot_test';
process.env.ENV = 'test';
process.env.GROK_API_KEY = 'test';
process.env.OPENAI_API_KEY = 'test';
/* eslint-enable node/no-process-env */

const { createEntityManagerMiddleware } = await import('./middlewares.js');

const createContext = () =>
  ({
    state: {},
  } as BotContext);

describe('entityManagerMiddleware', () => {
  it('assigns one forked entity manager to each update', async () => {
    const managers = [{ id: 1 }, { id: 2 }] as unknown as EntityManager[];
    const middleware = createEntityManagerMiddleware(() => {
      const manager = managers.shift();
      if (!manager) {
        throw new Error('No entity manager available');
      }

      return manager;
    });
    const first = createContext();
    const second = createContext();

    await middleware(first, async () => undefined);
    await middleware(second, async () => undefined);

    assert.notEqual(first.state.em, second.state.em);
  });

  it('passes the assigned entity manager downstream', async () => {
    const manager = { id: 1 } as unknown as EntityManager;
    const middleware = createEntityManagerMiddleware(() => manager);
    const context = createContext();
    let downstreamManager: EntityManager | undefined;

    await middleware(context, async () => {
      downstreamManager = context.state.em;
    });

    assert.equal(downstreamManager, manager);
  });
});
