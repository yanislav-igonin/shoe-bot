import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { User } from "../entities.js";

/* eslint-disable node/no-process-env */
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
/* eslint-enable node/no-process-env */

if (testDatabaseUrl && !testDatabaseUrl.endsWith("_test")) {
	throw new Error("TEST_DATABASE_URL must target a database ending in _test");
}

describe("MikroORM baseline migration", { skip: !testDatabaseUrl }, () => {
	it("creates the current application schema", async () => {
		if (!testDatabaseUrl) {
			throw new Error("TEST_DATABASE_URL is not set");
		}

		const { createDatabase } = await import("./database.js");
		const orm = await createDatabase(testDatabaseUrl);

		try {
			await orm.em
				.getConnection()
				.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
			await orm.migrator.up();

			const tables = await orm.em
				.getConnection()
				.execute<Array<{ table_name: string }>>(
					`SELECT table_name
         FROM information_schema.tables
         WHERE table_schema = 'public'
           AND table_type = 'BASE TABLE'
           AND table_name != 'mikro_orm_migrations'
         ORDER BY table_name`,
				);
			const constraints = await orm.em
				.getConnection()
				.execute<Array<{ conname: string }>>(
					`SELECT conname
           FROM pg_constraint
           WHERE conname = 'daily_request_usages_used_check'`,
				);
			const enumValues = await orm.em
				.getConnection()
				.execute<Array<{ enumlabel: string; typname: string }>>(
					`SELECT type.typname, enum.enumlabel
           FROM pg_enum enum
           JOIN pg_type type ON type.oid = enum.enumtypid
           WHERE type.typname IN ('ChatType', 'MessageType')
           ORDER BY type.typname, enum.enumsortorder`,
				);
			const indexes = await orm.em
				.getConnection()
				.execute<Array<{ indexname: string }>>(
					`SELECT indexname
           FROM pg_indexes
           WHERE schemaname = 'public'
             AND indexname IN (
               'activation_codes_code_key',
               'daily_request_usages_userId_date_key',
               'new_users_tgId_key',
               'user_settings_userId_key'
             )
           ORDER BY indexname`,
				);
			const seedCounts = await orm.em
				.getConnection()
				.execute<
					Array<{ botRoles: number; botUsers: number; settings: number }>
				>(
					`SELECT
             (SELECT COUNT(*)::int FROM "bot_roles") AS "botRoles",
             (SELECT COUNT(*)::int FROM "users" WHERE id = 0) AS "botUsers",
             (SELECT COUNT(*)::int FROM "settings") AS "settings"`,
				);

			assert.deepEqual(
				tables.map(({ table_name: tableName }) => tableName),
				[
					"activation_codes",
					"bot_roles",
					"chats",
					"daily_request_usages",
					"dialogs",
					"messages",
					"settings",
					"user_settings",
					"users",
				],
			);
			assert.equal(constraints.length, 1);
			assert.deepEqual(enumValues, [
				{ enumlabel: "private", typname: "ChatType" },
				{ enumlabel: "group", typname: "ChatType" },
				{ enumlabel: "supergroup", typname: "ChatType" },
				{ enumlabel: "channel", typname: "ChatType" },
				{ enumlabel: "text", typname: "MessageType" },
				{ enumlabel: "image", typname: "MessageType" },
				{ enumlabel: "voice", typname: "MessageType" },
			]);
			assert.deepEqual(
				indexes.map(({ indexname }) => indexname),
				[
					"activation_codes_code_key",
					"daily_request_usages_userId_date_key",
					"new_users_tgId_key",
					"user_settings_userId_key",
				],
			);
			assert.deepEqual(seedCounts, [{ botRoles: 2, botUsers: 1, settings: 2 }]);
		} finally {
			await orm.close(true);
		}
	});

	it("reserves and refunds daily quota atomically", async () => {
		if (!testDatabaseUrl) {
			throw new Error("TEST_DATABASE_URL is not set");
		}

		const { createDatabase } = await import("./database.js");
		const {
			getRemainingDailyRequests,
			refundDailyRequest,
			reserveDailyRequest,
		} = await import("./dailyQuota.js");
		const orm = await createDatabase(testDatabaseUrl);

		try {
			await orm.em
				.getConnection()
				.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
			await orm.migrator.up();
			const [{ id: userId }] = await orm.em
				.getConnection()
				.execute<Array<{ id: number }>>(
					`INSERT INTO "users" ("tgId", "allowedTill")
           VALUES ('quota-test-user', '2030-01-02')
           RETURNING "id"`,
				);
			const hydratedUser = await orm.em.fork().findOneOrFail(User, userId);
			assert.equal(hydratedUser.allowedTill, "2030-01-02");
			const reservations = await Promise.all([
				reserveDailyRequest(orm.em.fork(), userId),
				reserveDailyRequest(orm.em.fork(), userId),
				reserveDailyRequest(orm.em.fork(), userId),
				reserveDailyRequest(orm.em.fork(), userId),
			]);

			assert.deepEqual(
				[...reservations].sort((left, right) => (left ?? 99) - (right ?? 99)),
				[1, 2, 3, null],
			);
			assert.equal(await getRemainingDailyRequests(orm.em.fork(), userId), 0);

			await refundDailyRequest(orm.em.fork(), userId);

			assert.equal(await getRemainingDailyRequests(orm.em.fork(), userId), 1);
		} finally {
			await orm.close(true);
		}
	});
});
