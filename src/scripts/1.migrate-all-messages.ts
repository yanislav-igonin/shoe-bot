/**
 * Script done to migrate users from old database to new one.
 * Initialy I wanted to migrate all messages, but it's too much work
 * and I just dont have the whole data to do it.
 */

// eslint-disable-next-line canonical/filename-match-regex
import { type NewUser } from '@prisma/client';
import { database } from 'lib/database';
import { logger } from 'lib/logger';

const run = async () => {
  await database.$connect();

  // Create Bot user
  await database.newUser.create({
    data: {
      firstName: 'Bot',
      id: 0,
      isAllowed: true,
      lastName: 'Bot',
      tgId: '0',
      username: 'Bot',
    },
  });

  // Recreate users
  const users = await database.user.findMany();
  const newUsers = users.map((user) => {
    const newUser: Omit<NewUser, 'id'> = {
      createdAt: user.createdAt,
      firstName: user.firstName,
      isAllowed: user.isAllowed,
      languageCode: user.language,
      lastName: user.lastName,
      tgId: user.id,
      username: user.username,
    };
    return newUser;
  });
  await database.newUser.createMany({
    data: newUsers,
  });
};

run()
  .then(() => logger.info('data has been migrated'))
  .catch((error) => {
    logger.error(error);
    throw error;
  });
