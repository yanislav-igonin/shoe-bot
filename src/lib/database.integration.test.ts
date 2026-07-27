import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

/* eslint-disable node/no-process-env */
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
/* eslint-enable node/no-process-env */

if (testDatabaseUrl && !testDatabaseUrl.endsWith('_test')) {
  throw new Error('TEST_DATABASE_URL must target a database ending in _test');
}

describe('MikroORM baseline migration', { skip: !testDatabaseUrl }, () => {
  it('creates the current application schema', async () => {
    if (!testDatabaseUrl) {
      throw new Error('TEST_DATABASE_URL is not set');
    }

    const { createDatabase } = await import('./database.js');
    const orm = await createDatabase(testDatabaseUrl);

    try {
      await orm.em
        .getConnection()
        .execute('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
      await orm.migrator.up();

      const tables = await orm.em
        .getConnection()
        .execute<Array<{ table_name: string }>>(
          `SELECT table_name
         FROM information_schema.tables
         WHERE table_schema = 'public'
           AND table_type = 'BASE TABLE'
           AND table_name != 'mikro_orm_migrations'
         ORDER BY table_name`,
        );
      const constraints = await orm.em
        .getConnection()
        .execute<Array<{ conname: string }>>(
          `SELECT conname
           FROM pg_constraint
           WHERE conname = 'daily_request_usages_used_check'`,
        );

      assert.deepEqual(
        tables.map(({ table_name: tableName }) => tableName),
        [
          'activation_codes',
          'bot_roles',
          'chats',
          'daily_request_usages',
          'dialogs',
          'messages',
          'settings',
          'user_settings',
          'users',
        ],
      );
      assert.equal(constraints.length, 1);
    } finally {
      await orm.close(true);
    }
  });

  it('reserves and refunds daily quota atomically', async () => {
    if (!testDatabaseUrl) {
      throw new Error('TEST_DATABASE_URL is not set');
    }

    const { createDatabase } = await import('./database.js');
    const {
      getRemainingDailyRequests,
      refundDailyRequest,
      reserveDailyRequest,
    } = await import('./dailyQuota.js');
    const orm = await createDatabase(testDatabaseUrl);

    try {
      await orm.em
        .getConnection()
        .execute('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
      await orm.migrator.up();
      const [{ id: userId }] = await orm.em
        .getConnection()
        .execute<Array<{ id: number }>>(
          `INSERT INTO "users" ("tgId")
           VALUES ('quota-test-user')
           RETURNING "id"`,
        );
      const reservations = await Promise.all([
        reserveDailyRequest(orm.em.fork(), userId),
        reserveDailyRequest(orm.em.fork(), userId),
        reserveDailyRequest(orm.em.fork(), userId),
        reserveDailyRequest(orm.em.fork(), userId),
      ]);

      assert.deepEqual(
        [...reservations].sort((left, right) => (left ?? 99) - (right ?? 99)),
        [1, 2, 3, null],
      );
      assert.equal(await getRemainingDailyRequests(orm.em.fork(), userId), 0);

      await refundDailyRequest(orm.em.fork(), userId);

      assert.equal(await getRemainingDailyRequests(orm.em.fork(), userId), 1);
    } finally {
      await orm.close(true);
    }
  });
});
