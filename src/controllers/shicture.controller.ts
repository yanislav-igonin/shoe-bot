import { type CommandContext, InputFile } from "grammy";
import { config } from "lib/config.js";
import type { BotContext } from "lib/context.js";
import { generateImage } from "lib/imageGeneration.js";
import { logger } from "lib/logger.js";
import { runPersistedGeneration } from "lib/persistedGeneration.js";
import { getShictureDescription } from "lib/prompt.js";
import { replies } from "lib/replies.js";
import { Message, MessageType, User } from "../entities.js";

export const shictureController = async (
	context: CommandContext<BotContext>,
) => {
	const {
		message,
		state: { dialog, em, user },
	} = context;

	if (!message) {
		return;
	}

	const { message_id: messageId } = message;

	const newUserMessage = em.create(Message, {
		dialog,
		text: message.text,
		tgMessageId: messageId.toString(),
		type: MessageType.image,
		user,
	});

	try {
		await context.replyWithChatAction("upload_photo");
		await runPersistedGeneration({
			generate: async () => {
				const prompt = await getShictureDescription();
				const image = await generateImage(em, prompt);
				if (!image) {
					logger.error("Failed to generate image");
					throw new Error("Failed to generate image");
				}

				return { image, prompt };
			},
			persistRequest: async () => {
				em.persist(newUserMessage);
				await em.flush();
			},
			persistResponse: async ({ image, prompt }) => {
				const source = typeof image === "string" ? new URL(image) : image;
				const file = new InputFile(source, "image.png");
				const botReply = await context.replyWithPhoto(file, {
					caption: prompt,
					reply_to_message_id: messageId,
				});
				const botMessage = em.create(Message, {
					dialog,
					replyTo: newUserMessage,
					text: prompt,
					tgMessageId: botReply.message_id.toString(),
					tgPhotoId: botReply.photo[botReply.photo.length - 1].file_id,
					type: MessageType.image,
					user: em.getReference(User, config.botId),
				});
				em.persist(botMessage);
				await em.flush();
			},
		});
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
