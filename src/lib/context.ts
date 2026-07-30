import type { EntityManager } from "@mikro-orm/postgresql";
import type { Context } from "grammy";
import type { Chat, Dialog, User, UserSettings } from "../entities.js";

export type BotContext = Context & {
	state: {
		chat: Chat;
		dialog: Dialog;
		em: EntityManager;
		user: User;
		userSettings: UserSettings;
	};
};
