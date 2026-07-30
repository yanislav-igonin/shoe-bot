import { DateTime } from "luxon";

const parseAllowedTill = (allowedTill: string) => {
	const date = DateTime.fromISO(allowedTill, { zone: "utc" });
	if (!date.isValid) {
		throw new Error(`Invalid subscription date: ${allowedTill}`);
	}

	return date;
};

export const isSubscriptionActive = (
	allowedTill: string | null,
	now: DateTime<boolean> = DateTime.now().toUTC(),
) => allowedTill !== null && now < parseAllowedTill(allowedTill).endOf("day");

export const getNewAllowedTill = (
	allowedTill: string | null,
	now: DateTime<boolean> = DateTime.now().toUTC(),
) => {
	const currentEnd = allowedTill ? parseAllowedTill(allowedTill) : null;
	const base = currentEnd && now < currentEnd.endOf("day") ? currentEnd : now;
	const newAllowedTill = base.plus({ month: 1 }).toISODate();
	if (!newAllowedTill) {
		throw new Error("Failed to calculate subscription date");
	}

	return newAllowedTill;
};

export const formatAllowedTill = (allowedTill: string | null) => {
	if (!allowedTill) {
		throw new Error("Subscription date is missing");
	}

	return parseAllowedTill(allowedTill).toFormat("dd.MM.yyyy");
};
