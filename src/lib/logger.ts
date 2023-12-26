import { getLogTime } from './date';

/* eslint-disable no-console */
const info = (data: unknown) => console.log(getLogTime(), data);
const error = (...args: unknown[]) => console.error(getLogTime(), args);
/* eslint-enable no-console */

export const logger = {
  error,
  info,
};
