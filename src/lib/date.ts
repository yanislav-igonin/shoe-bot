export const MONTH_MS = 30 * 24 * 60 * 60 * 1_000;

type HaveCreatedAt = {
  createdAt: Date;
};
export const sortByCreatedAt = (a: HaveCreatedAt, b: HaveCreatedAt) => {
  if (a.createdAt > b.createdAt) return 1;
  if (a.createdAt < b.createdAt) return -1;
  return 0;
};

export const getLogTime = () => {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const day = now.getUTCDate();
  let hours: number | string = now.getUTCHours();
  if (hours < 10) {
    hours = `0${hours}`;
  }

  let minutes: number | string = now.getUTCMinutes();
  if (minutes < 10) {
    minutes = `0${minutes}`;
  }

  let seconds: number | string = now.getUTCSeconds();
  if (seconds < 10) {
    seconds = `0${seconds}`;
  }

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};
