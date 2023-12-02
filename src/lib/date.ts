export const MONTH_MS = 30 * 24 * 60 * 60 * 1_000;

type HaveCreatedAt = {
  createdAt: Date;
};
export const sortByCreatedAt = (a: HaveCreatedAt, b: HaveCreatedAt) => {
  if (a.createdAt > b.createdAt) return 1;
  if (a.createdAt < b.createdAt) return -1;
  return 0;
};
