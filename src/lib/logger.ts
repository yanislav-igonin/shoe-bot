import { getLogTime } from "./date.js";

const info = (...data: unknown[]) => console.log(getLogTime(), ...data);
const error = (...args: unknown[]) => console.error(getLogTime(), ...args);

export const logger = {
	error,
	info,
};
