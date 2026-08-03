import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyRequest } from "./requestAccess.js";

const requestAccess = (await import("./requestAccess.js")) as typeof import("./requestAccess.js") & {
	getRequestText?: (message: { caption?: string; text?: string }) =>
		| string
		| undefined;
};

const baseInput = {
	botUsername: "shoe_bot",
	chatType: "group",
	command: undefined,
	isReplyToAnotherBot: false,
	isReplyToThisBot: false,
	matchesTextTrigger: false,
	text: "обычное сообщение",
};

describe("classifyRequest", () => {
	it("passes service commands for free", () => {
		assert.equal(
			classifyRequest({
				...baseInput,
				command: "profile",
				text: "/profile",
			}),
			"free",
		);
	});

	it("classifies private text as generation", () => {
		assert.equal(
			classifyRequest({
				...baseInput,
				chatType: "private",
			}),
			"generation",
		);
	});

	it("classifies a group trigger as generation", () => {
		assert.equal(
			classifyRequest({
				...baseInput,
				matchesTextTrigger: true,
			}),
			"generation",
		);
	});

	it("classifies a reply to this bot as generation", () => {
		assert.equal(
			classifyRequest({
				...baseInput,
				isReplyToThisBot: true,
			}),
			"generation",
		);
	});

	it("classifies shicture as generation", () => {
		assert.equal(
			classifyRequest({
				...baseInput,
				command: "shicture",
				text: "/shicture",
			}),
			"generation",
		);
	});

	it("ignores unrelated group text", () => {
		assert.equal(classifyRequest(baseInput), "ignore");
	});

	it("ignores a reply to another bot", () => {
		assert.equal(
			classifyRequest({
				...baseInput,
				chatType: "private",
				isReplyToAnotherBot: true,
				isReplyToThisBot: false,
			}),
			"ignore",
		);
	});

	it("ignores a command addressed to another bot", () => {
		assert.equal(
			classifyRequest({
				...baseInput,
				chatType: "private",
				command: "profile@other_bot",
				text: "/profile@other_bot",
			}),
			"ignore",
		);
	});

	it("does not treat uppercase commands as free", () => {
		assert.equal(
			classifyRequest({
				...baseInput,
				chatType: "private",
				command: "PROFILE",
				text: "/PROFILE",
			}),
			"generation",
		);
	});
});

describe("getRequestText", () => {
	it("prefers message text over a caption", () => {
		assert.equal(
			requestAccess.getRequestText?.({
				caption: "photo caption",
				text: "message text",
			}),
			"message text",
		);
	});

	it("uses a photo caption when message text is absent", () => {
		assert.equal(
			requestAccess.getRequestText?.({ caption: "photo caption" }),
			"photo caption",
		);
	});
});
