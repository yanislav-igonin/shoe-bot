type HaveCreatedAt = {
  createdAt: Date;
};
export const sortByCreatedAt = (a: HaveCreatedAt, b: HaveCreatedAt) => {
  if (a.createdAt > b.createdAt) return 1;
  if (a.createdAt < b.createdAt) return -1;
  return 0;
};
