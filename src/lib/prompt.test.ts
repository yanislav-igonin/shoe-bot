import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Message, MessageType, User } from "../entities.js";

process.env.BOT_TOKEN = "test";
process.env.GROK_API_KEY = "test";
process.env.OPENAI_API_KEY = "test";

const { addUserContext, chooseTask } = await import("lib/prompt.js");

const user = new User();
user.id = 1;
user.tgId = "1";

const message = new Message();
message.createdAt = new Date(0);
message.id = 1;
message.text = "describe this";
message.tgMessageId = "1";
message.tgPhotoId = "photo-id";
message.type = MessageType.image;
message.user = user;

describe("addUserContext", () => {
	it("converts a Telegram image message to AI SDK content", () => {
		assert.deepEqual(
			addUserContext(message, {
				[message.id]: "https://example.com/image.jpg",
			}),
			{
				content: [
					{ text: "describe this", type: "text" },
					{
						image: new URL("https://example.com/image.jpg"),
						type: "image",
					},
				],
				role: "user",
			},
		);
	});
});

describe("chooseTask", () => {
	it("returns the validated classifier choice", async () => {
		const task = await chooseTask("draw a boot", async () => MessageType.image);

		assert.equal(task, MessageType.image);
	});

	it("falls back to text when classification fails", async () => {
		const task = await chooseTask("draw a boot", async () => {
			throw new Error("classifier unavailable");
		});

		assert.equal(task, MessageType.text);
	});
});
