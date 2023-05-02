type HaveIdPerChat = {
  idPerChat: Date;
};
export const sortByIdPerChat = (a: HaveIdPerChat, b: HaveIdPerChat) => {
  if (a.idPerChat > b.idPerChat) return 1;
  if (a.idPerChat < b.idPerChat) return -1;
  return 0;
};
