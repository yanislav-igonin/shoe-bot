import { createOrmConfig } from '../mikro-orm.config.js';
import { MikroORM } from '@mikro-orm/postgresql';

export const createDatabase = async (clientUrl?: string): Promise<MikroORM> =>
  await MikroORM.init({
    ...createOrmConfig(clientUrl),
  });

let orm: MikroORM | undefined;

export const getOrm = () => {
  if (!orm) {
    throw new Error('Database is not initialized');
  }

  return orm;
};

export const initializeDatabase = async () => {
  orm = await createDatabase();
};

export const closeDatabase = async () => {
  if (orm) {
    await orm.close(true);
  }
};
