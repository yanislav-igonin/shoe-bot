import { MessageType } from '../entities.js';
import { type EntityManager } from '@mikro-orm/postgresql';
import { MONTH_MS } from 'lib/date.js';

type PromptsCountResult = {
  firstName: string;
  lastName: string;
  messagesCount: number;
  userId: string;
  username: string;
};

const getMessagesCountForLastMonthGroupedByUser = async (
  em: EntityManager,
  type: MessageType,
) => {
  const minusMonth = new Date(Date.now() - MONTH_MS);

  return await em.getConnection().execute<PromptsCountResult[]>(
    `
    SELECT
      COUNT(m.id)::int AS "messagesCount",
      u.username,
      u."firstName",
      u."lastName",
      m."userId"
    FROM messages m
    LEFT JOIN users u
      ON m."userId" = u.id
    WHERE m."createdAt" > ?
      AND m.type = ?
      AND u.id != 0
    GROUP BY m."userId", u.username, u."firstName", u."lastName"
    ORDER BY "messagesCount" DESC
    `,
    [minusMonth, type],
  );
};

export const getTextMessagesCountForLastMonthGroupedByUser = async (
  em: EntityManager,
) => await getMessagesCountForLastMonthGroupedByUser(em, MessageType.text);

export const getImageMessagesCountForLastMonthGroupedByUser = async (
  em: EntityManager,
) => await getMessagesCountForLastMonthGroupedByUser(em, MessageType.image);

export const getVoiceMessagesCountForLastMonthGroupedByUser = async (
  em: EntityManager,
) => await getMessagesCountForLastMonthGroupedByUser(em, MessageType.voice);
