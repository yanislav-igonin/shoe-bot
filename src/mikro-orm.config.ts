import { entities } from './entities.js';
import { Migrator } from '@mikro-orm/migrations';
import { defineConfig } from '@mikro-orm/postgresql';

export const createOrmConfig = (clientUrl?: string) => {
  /* eslint-disable node/no-process-env */
  const databaseUrl = clientUrl ?? process.env.DATABASE_URL;
  /* eslint-enable node/no-process-env */
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set');
  }

  return defineConfig({
    clientUrl: databaseUrl,
    entities,
    extensions: [Migrator],
    migrations: {
      path: 'dist/migrations',
      pathTs: 'src/migrations',
      tableName: 'mikro_orm_migrations',
      transactional: true,
    },
  });
};

export default () => createOrmConfig();
