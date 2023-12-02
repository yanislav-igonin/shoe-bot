/* eslint-disable no-console */
const info = (data: unknown) => console.log(data);
const error = (...args: unknown[]) => console.error(args);
/* eslint-enable no-console */

export const logger = {
  error,
  info,
};
