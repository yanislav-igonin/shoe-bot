import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { DateTime } from "luxon";
import {
	formatAllowedTill,
	getNewAllowedTill,
	isSubscriptionActive,
} from "./subscription.js";

describe("subscription dates", () => {
	const now = DateTime.fromISO("2030-01-15T12:00:00Z");

	it("handles PostgreSQL date strings", () => {
		assert.equal(isSubscriptionActive("2030-01-15", now), true);
		assert.equal(isSubscriptionActive("2030-01-14", now), false);
		assert.equal(isSubscriptionActive(null, now), false);
		assert.equal(formatAllowedTill("2030-02-03"), "03.02.2030");
	});

	it("renews from today when expired", () => {
		assert.equal(getNewAllowedTill("2030-01-14", now), "2030-02-15");
	});

	it("extends an active subscription from its current end date", () => {
		assert.equal(getNewAllowedTill("2030-02-15", now), "2030-03-15");
	});
});
