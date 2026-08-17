import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	fetchHuggingFaceEndpointMetadata,
	parseHuggingFaceTextEndpointSettings,
	reconcileHuggingFaceTextEndpointState,
	updateHuggingFaceEndpointRepository,
} from "lib/huggingFaceTextEndpoint.js";

const settingsRows = (overrides: Record<string, string> = {}) => {
	const values = {
		hfInferenceEndpointNamespace: "yanislav-igonin",
		hfTextInferenceEndpointName: "shoe-bot-text",
		hfTextInferenceEndpointUrl: "https://old.example.endpoints.huggingface.cloud",
		textModel: "owner/new-model",
		...overrides,
	};
	return Object.entries(values).map(([key, value]) => ({ key, value }));
};

describe("parseHuggingFaceTextEndpointSettings", () => {
	it("parses mutable endpoint settings from database rows", () => {
		assert.deepEqual(parseHuggingFaceTextEndpointSettings(settingsRows()), {
			desiredRepository: "owner/new-model",
			endpointName: "shoe-bot-text",
			endpointUrl: "https://old.example.endpoints.huggingface.cloud",
			namespace: "yanislav-igonin",
		});
	});

	it("allows an empty cached URL because metadata reconciliation can recover it", () => {
		assert.equal(
			parseHuggingFaceTextEndpointSettings(
				settingsRows({ hfTextInferenceEndpointUrl: "" }),
			).endpointUrl,
			undefined,
		);
	});

	it("rejects missing namespace and endpoint name", () => {
		assert.throws(
			() =>
				parseHuggingFaceTextEndpointSettings(
					settingsRows({ hfInferenceEndpointNamespace: "" }),
				),
			/hfInferenceEndpointNamespace setting is empty/u,
		);
		assert.throws(
			() =>
				parseHuggingFaceTextEndpointSettings(
					settingsRows({ hfTextInferenceEndpointName: "" }),
				),
			/hfTextInferenceEndpointName setting is empty/u,
		);
	});
});

describe("Hugging Face endpoint management API", () => {
	it("fetches endpoint metadata by namespace and name", async () => {
		let request: Request | undefined;
		const fetcher = (async (input, init) => {
			request = new Request(input, init);
			return new Response(
				JSON.stringify({
					model: { repository: "owner/current-model" },
					status: {
						state: "scaledToZero",
						url: "https://current.example.endpoints.huggingface.cloud",
					},
				}),
				{ status: 200 },
			);
		}) as typeof fetch;

		const metadata = await fetchHuggingFaceEndpointMetadata(
			{
				endpointName: "shoe-bot-text",
				namespace: "yanislav-igonin",
				token: "hf-token",
			},
			fetcher,
		);

		assert.equal(
			request?.url,
			"https://api.endpoints.huggingface.cloud/v2/endpoint/yanislav-igonin/shoe-bot-text",
		);
		assert.equal(request?.method, "GET");
		assert.equal(request?.headers.get("authorization"), "Bearer hf-token");
		assert.deepEqual(metadata, {
			repository: "owner/current-model",
			status: "scaledToZero",
			url: "https://current.example.endpoints.huggingface.cloud",
		});
	});

	it("updates the existing endpoint repository with the official PUT payload", async () => {
		let request: Request | undefined;
		const fetcher = (async (input, init) => {
			request = new Request(input, init);
			return new Response(
				JSON.stringify({
					model: { repository: "owner/new-model" },
					status: { state: "pending", url: null },
				}),
				{ status: 200 },
			);
		}) as typeof fetch;

		await updateHuggingFaceEndpointRepository(
			{
				endpointName: "shoe-bot-text",
				namespace: "yanislav-igonin",
				token: "hf-token",
			},
			"owner/new-model",
			fetcher,
		);

		assert.equal(request?.method, "PUT");
		assert.deepEqual(await request?.json(), {
			model: { repository: "owner/new-model" },
		});
	});
});

describe("reconcileHuggingFaceTextEndpointState", () => {
	it("updates a mismatched repository, waits until ready, and persists the current URL", async () => {
		const savedUrls: string[] = [];
		let metadataCalls = 0;
		let updateCalls = 0;
		const store = {
			load: async () => parseHuggingFaceTextEndpointSettings(settingsRows()),
			saveUrl: async (url: string) => {
				savedUrls.push(url);
			},
		};
		const fetchMetadata = async () => {
			metadataCalls += 1;
			if (metadataCalls === 1) {
				return {
					repository: "owner/old-model",
					status: "scaledToZero",
					url: "https://old.example.endpoints.huggingface.cloud",
				};
			}
			if (metadataCalls === 2) {
				return { repository: "owner/new-model", status: "pending" };
			}
			return {
				repository: "owner/new-model",
				status: "running",
				url: "https://new.example.endpoints.huggingface.cloud",
			};
		};

		const resolved = await reconcileHuggingFaceTextEndpointState(store, "hf-token", {
			fetchMetadata,
			sleep: async () => {},
			updateRepository: async () => {
				updateCalls += 1;
				return { repository: "owner/new-model", status: "pending" };
			},
		});

		assert.equal(updateCalls, 1);
		assert.equal(metadataCalls, 3);
		assert.deepEqual(savedUrls, [
			"https://new.example.endpoints.huggingface.cloud",
		]);
		assert.equal(
			resolved.endpointUrl,
			"https://new.example.endpoints.huggingface.cloud",
		);
		assert.deepEqual(resolved.managementConfig, {
			endpointName: "shoe-bot-text",
			namespace: "yanislav-igonin",
			token: "hf-token",
		});
	});

	it("does not update repository when the endpoint already matches", async () => {
		let updateCalls = 0;
		const savedUrls: string[] = [];
		const resolved = await reconcileHuggingFaceTextEndpointState(
			{
				load: async () => parseHuggingFaceTextEndpointSettings(settingsRows()),
				saveUrl: async (url: string) => {
					savedUrls.push(url);
				},
			},
			"hf-token",
			{
				fetchMetadata: async () => ({
					repository: "owner/new-model",
					status: "scaledToZero",
					url: "https://same.example.endpoints.huggingface.cloud",
				}),
				updateRepository: async () => {
					updateCalls += 1;
					throw new Error("should not update");
				},
			},
		);

		assert.equal(updateCalls, 0);
		assert.equal(
			resolved.endpointUrl,
			"https://same.example.endpoints.huggingface.cloud",
		);
		assert.deepEqual(savedUrls, [
			"https://same.example.endpoints.huggingface.cloud",
		]);
	});

	it("fails immediately when Hugging Face reports a failed endpoint state", async () => {
		await assert.rejects(
			reconcileHuggingFaceTextEndpointState(
				{
					load: async () => parseHuggingFaceTextEndpointSettings(settingsRows()),
					saveUrl: async () => {},
				},
				"hf-token",
				{
					fetchMetadata: async () => ({
						repository: "owner/new-model",
						status: "updateFailed",
					}),
				},
			),
			/Hugging Face text endpoint entered updateFailed state/u,
		);
	});
});
