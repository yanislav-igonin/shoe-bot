export const valueOrNull = (value: string | undefined) => value ?? null;
export const valueOrDefault = <T>(value: T | undefined, defaultValue: T) =>
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  value || defaultValue;
export const valueOrThrow = <T>(value: T | undefined, message: string) => {
  if (value === undefined) {
    throw new Error(message);
  }

  return value;
};
