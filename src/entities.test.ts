import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { MikroORM } from "@mikro-orm/postgresql";
import {
	ActivationCode,
	BotRole,
	Chat,
	DailyRequestUsage,
	Dialog,
	entities,
	Message,
	Setting,
	User,
	UserSettings,
} from "./entities.js";

describe("MikroORM entity metadata", () => {
	it("maps every current database table", async () => {
		const orm = new MikroORM({
			clientUrl: "postgresql://postgres:postgres@localhost/shoe_bot_metadata",
			entities,
		});

		const tableNames = [
			ActivationCode,
			BotRole,
			Chat,
			DailyRequestUsage,
			Dialog,
			Message,
			Setting,
			User,
			UserSettings,
		]
			.map((entity) => orm.getMetadata().getAll().get(entity)?.tableName)
			.sort((left, right) => left?.localeCompare(right ?? "") ?? 0);

		assert.deepEqual(tableNames, [
			"activation_codes",
			"bot_roles",
			"chats",
			"daily_request_usages",
			"dialogs",
			"messages",
			"settings",
			"user_settings",
			"users",
		]);
	});

	it("keeps the existing relation column names", async () => {
		const orm = new MikroORM({
			clientUrl: "postgresql://postgres:postgres@localhost/shoe_bot_metadata",
			entities,
		});
		const user = orm.getMetadata().get(User);
		const message = orm.getMetadata().get(Message);

		assert.deepEqual(user.properties.allowedTill.fieldNames, ["allowedTill"]);
		assert.deepEqual(message.properties.user.fieldNames, ["userId"]);
		assert.deepEqual(message.properties.replyTo.fieldNames, ["replyToId"]);
	});
});
