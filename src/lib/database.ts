import ormConfig from '../mikro-orm.config.js';
import { MikroORM } from '@mikro-orm/postgresql';
import { PrismaClient } from '@prisma/client';

export const createDatabase = async (
  clientUrl = ormConfig.clientUrl,
): Promise<MikroORM> =>
  await MikroORM.init({
    ...ormConfig,
    clientUrl,
  });

let orm: MikroORM | undefined;

// Removed after all data-access consumers migrate to MikroORM.
export const database = new PrismaClient();

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
