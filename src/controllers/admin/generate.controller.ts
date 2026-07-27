import type { CommandContext } from "grammy";
import type { BotContext } from "lib/context.js";
import { ActivationCode } from "../../entities.js";

export const generateController = async (
	context: CommandContext<BotContext>,
) => {
	const { em } = context.state;
	const newActivationCode = em.create(ActivationCode, {});
	em.persist(newActivationCode);
	await em.flush();
	const code = newActivationCode.code;
	await context.reply(`Activation code:`);
	await context.reply(code);
};
