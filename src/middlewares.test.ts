import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { EntityManager } from "@mikro-orm/postgresql";
import { type BotRole, Chat, User, UserSettings } from "./entities.js";
import type { BotContext } from "./lib/context.js";

/* eslint-disable node/no-process-env */
process.env.ADMINS_USERNAMES = "";
process.env.BOT_TOKEN = "test";
process.env.DATABASE_URL =
	"postgresql://postgres:postgres@localhost/shoe_bot_test";
process.env.ENV = "test";
process.env.GROK_API_KEY = "test";
process.env.OPENAI_API_KEY = "test";
/* eslint-enable node/no-process-env */

const {
	chatMiddleware,
	createEntityManagerMiddleware,
	userMiddleware,
	userSettingsMiddleware,
} = await import("./middlewares.js");

const createContext = () =>
	({
		state: {},
	}) as BotContext;

describe("entityManagerMiddleware", () => {
	it("assigns one forked entity manager to each update", async () => {
		const managers = [{ id: 1 }, { id: 2 }] as unknown as EntityManager[];
		const middleware = createEntityManagerMiddleware(() => {
			const manager = managers.shift();
			if (!manager) {
				throw new Error("No entity manager available");
			}

			return manager;
		});
		const first = createContext();
		const second = createContext();

		await middleware(first, async () => undefined);
		await middleware(second, async () => undefined);

		assert.notEqual(first.state.em, second.state.em);
	});

	it("passes the assigned entity manager downstream", async () => {
		const manager = { id: 1 } as unknown as EntityManager;
		const middleware = createEntityManagerMiddleware(() => manager);
		const context = createContext();
		let downstreamManager: EntityManager | undefined;

		await middleware(context, async () => {
			downstreamManager = context.state.em;
		});

		assert.equal(downstreamManager, manager);
	});
});

describe("parallel-safe entity creation", () => {
	it("upserts a missing chat by Telegram ID", async () => {
		const expectedChat = { id: 1, tgId: "123" } as Chat;
		const em = {
			findOne: async () => null,
			upsert: async (
				entity: unknown,
				data: Record<string, unknown>,
				options: Record<string, unknown>,
			) => {
				assert.equal(entity, Chat);
				assert.deepEqual(data, {
					name: "user",
					tgId: "123",
					type: "private",
				});
				assert.deepEqual(options, { onConflictFields: ["tgId"] });
				return expectedChat;
			},
		} as unknown as EntityManager;
		const context = {
			chat: { id: 123, type: "private" },
			state: { em },
		} as BotContext;
		let calledNext = false;

		await chatMiddleware(context, async () => {
			calledNext = true;
		});

		assert.equal(context.state.chat, expectedChat);
		assert.equal(calledNext, true);
	});

	it("upserts a missing user by Telegram ID", async () => {
		const expectedUser = { id: 1, tgId: "456" } as User;
		const em = {
			findOne: async () => null,
			upsert: async (
				entity: unknown,
				data: Record<string, unknown>,
				options: Record<string, unknown>,
			) => {
				assert.equal(entity, User);
				assert.deepEqual(data, {
					firstName: "Ada",
					languageCode: "en",
					lastName: null,
					tgId: "456",
					username: "ada",
				});
				assert.deepEqual(options, { onConflictFields: ["tgId"] });
				return expectedUser;
			},
		} as unknown as EntityManager;
		const context = {
			from: {
				first_name: "Ada",
				id: 456,
				is_bot: false,
				language_code: "en",
				username: "ada",
			},
			state: { em },
		} as BotContext;

		await userMiddleware(context, async () => undefined);

		assert.equal(context.state.user, expectedUser);
	});

	it("upserts missing user settings without resetting an existing role", async () => {
		const user = { id: 1 } as User;
		const botRole = { id: 1 } as BotRole;
		const expectedSettings = { id: 1, user } as UserSettings;
		const em = {
			findOne: async () => null,
			getReference: () => botRole,
			upsert: async (
				entity: unknown,
				data: Record<string, unknown>,
				options: Record<string, unknown>,
			) => {
				assert.equal(entity, UserSettings);
				assert.equal(data.botRole, botRole);
				assert.ok(data.updatedAt instanceof Date);
				assert.equal(data.user, user);
				assert.deepEqual(options, {
					onConflictExcludeFields: ["botRole"],
					onConflictFields: ["user"],
				});
				return expectedSettings;
			},
		} as unknown as EntityManager;
		const context = { state: { em, user } } as BotContext;

		await userSettingsMiddleware(context, async () => undefined);

		assert.equal(context.state.userSettings, expectedSettings);
	});
});
