import { type Filter, InputFile } from "grammy";
import { config } from "lib/config.js";
import type { BotContext } from "lib/context.js";
import { generateImage } from "lib/imageGeneration.js";
import { logger } from "lib/logger.js";
import { chooseTask, preparePrompt } from "lib/prompt.js";
import { Message, MessageType, User } from "../entities.js";
import {
	getImageGenerationErrorReply,
	handleTriggeredImagePrompt,
} from "./imageEdit.controller.js";
import {
	generateTextResponse,
	imagePromptDependencies,
} from "./text.controller.js";

export const textTriggerController = async (
	context: Filter<BotContext, "message:text">,
) => {
	const {
		match,
		message,
		state: { dialog, em, user },
	} = context;

	const text = (match ? match[3] : message.text) ?? "";
	const { message_id: messageId, reply_to_message: replyToMessage } = message;
	const prompt = preparePrompt(text);
	if (
		await handleTriggeredImagePrompt(context, prompt, imagePromptDependencies)
	) {
		return;
	}

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

	const textController = async () => {
		await generateTextResponse(context, prompt, {
			requestMessage: newUserMessage,
		});
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
			await context.reply(getImageGenerationErrorReply(error), {
				reply_to_message_id: messageId,
			});
		} catch (replyError) {
			logger.error(replyError);
		}

		throw error;
	}
};
