import { type Filter, InputFile } from "grammy";
import { config } from "lib/config.js";
import type { BotContext } from "lib/context.js";
import { generateImage } from "lib/imageGeneration.js";
import { logger } from "lib/logger.js";
import {
	addSystemContext,
	chooseTask,
	getCompletion,
	MAIN_MODEL,
	maximumMessageLengthPrompt,
	// markdownRulesPrompt,
	preparePrompt,
} from "lib/prompt.js";
import { replies } from "lib/replies.js";
// @ts-expect-error openai/resources not found
import type { ChatCompletionMessageParam } from "openai/resources";
import { BotRole, Message, MessageType, User } from "../entities.js";

export const textTriggerController = async (
	context: Filter<BotContext, "message:text">,
) => {
	const {
		match,
		message,
		state: { dialog, em, user, userSettings },
	} = context;

	const text = (match ? match[3] : message.text) ?? "";
	const { message_id: messageId, reply_to_message: replyToMessage } = message;

	const prompt = preparePrompt(text);
	const previousMessage = await em.findOne(Message, {
		tgMessageId: replyToMessage?.message_id.toString() ?? "0",
	});
	const newUserMessage = em.create(Message, {
		dialog,
		replyTo: previousMessage,
		text,
		tgMessageId: messageId.toString(),
		type: MessageType.text,
		user,
	});
	em.persist(newUserMessage);
	await em.flush();

	const task = await chooseTask(prompt);
	if (newUserMessage.type !== task) {
		newUserMessage.type = task;
		await em.flush();
	}

	const botRole = await em.findOne(BotRole, {
		id: userSettings.botRoleId,
	});
	if (!botRole) {
		const error = new Error("Bot role is undefined");
		logger.error("Bot role is undefined");
		try {
			await context.reply(replies.error, {
				reply_to_message_id: messageId,
			});
		} catch (replyError) {
			logger.error(replyError);
		}

		throw error;
	}

	const systemContext: ChatCompletionMessageParam[] = [
		// addSystemContext(markdownRulesPrompt),
		addSystemContext(maximumMessageLengthPrompt),
	];
	if (botRole.systemPrompt) {
		systemContext.push(addSystemContext(botRole.systemPrompt));
	}

	const textController = async () => {
		await context.replyWithChatAction("typing");
		const model = MAIN_MODEL;

		const completition = await getCompletion(prompt, systemContext, model);
		const botUser = em.getReference(User, config.botId);

		for (const chunk of completition) {
			const botReply = await context.reply(chunk, {
				parse_mode: "Markdown",
				reply_to_message_id: messageId,
			});

			const botMessage = em.create(Message, {
				dialog,
				replyTo: newUserMessage,
				text: chunk,
				tgMessageId: botReply.message_id.toString(),
				type: MessageType.text,
				user: botUser,
			});
			em.persist(botMessage);
			await em.flush();
		}
	};

	const imageController = async () => {
		await context.replyWithChatAction("upload_photo");

		const image = await generateImage(em, prompt);
		if (!image) {
			logger.error("Failed to generate image");
			throw new Error("Failed to generate image");
		}

		const source = typeof image === "string" ? new URL(image) : image;
		const file = new InputFile(source, "image.png");

		const botReply = await context.replyWithPhoto(file, {
			reply_to_message_id: messageId,
		});
		const botMessageId = botReply.message_id.toString();
		const botFileId = botReply.photo[botReply.photo.length - 1].file_id;
		const botMessage = em.create(Message, {
			dialog,
			replyTo: newUserMessage,
			tgMessageId: botMessageId,
			tgPhotoId: botFileId,
			type: MessageType.image,
			user: em.getReference(User, config.botId),
		});
		em.persist(botMessage);
		await em.flush();
	};

	const controllers = {
		image: imageController,
		text: textController,
	};

	try {
		await controllers[task]();
	} catch (error) {
		try {
			await context.reply(replies.error, {
				reply_to_message_id: messageId,
			});
		} catch (replyError) {
			logger.error(replyError);
		}

		throw error;
	}
};
