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
});
