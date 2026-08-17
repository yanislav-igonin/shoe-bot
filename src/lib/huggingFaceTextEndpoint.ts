import type { EntityManager } from "@mikro-orm/postgresql";
import { config } from "lib/config.js";
import { getOrm } from "lib/database.js";
import type { HuggingFaceEndpointManagementConfig } from "lib/huggingFaceEndpointLifecycle.js";
import { logger } from "lib/logger.js";
import { Setting } from "../entities.js";

const HUGGING_FACE_ENDPOINTS_API_URL =
	"https://api.endpoints.huggingface.cloud/v2";
const HUGGING_FACE_MANAGEMENT_REQUEST_TIMEOUT_MS = 15_000;
const HUGGING_FACE_RECONCILE_INTERVAL_MS = 30_000;
const HUGGING_FACE_RECONCILE_MAX_WAIT_MS = 10 * 60_000;
const HUGGING_FACE_RECONCILE_POLL_MS = 5_000;
const HUGGING_FACE_TEXT_SETTING_KEYS = [
	"hfInferenceEndpointNamespace",
	"hfTextInferenceEndpointName",
	"hfTextInferenceEndpointUrl",
	"textModel",
	"textProvider",
] as const;
const FAILED_ENDPOINT_STATES = new Set(["failed", "updateFailed"]);
const READY_ENDPOINT_STATES = new Set(["running", "scaledToZero"]);

type SettingRow = {
	key: string;
	value: string;
};

export type HuggingFaceTextEndpointSettings = {
	desiredRepository: string;
	endpointName: string;
	endpointUrl?: string;
	namespace: string;
};

export type HuggingFaceEndpointMetadata = {
	repository: string;
	status: string;
	url?: string;
};

export type ResolvedHuggingFaceTextEndpoint = {
	endpointUrl: string;
	managementConfig: HuggingFaceEndpointManagementConfig;
};

type HuggingFaceTextEndpointStore = {
	load: () => Promise<HuggingFaceTextEndpointSettings>;
	saveUrl: (url: string) => Promise<void>;
};

type ReconcileOptions = {
	fetchMetadata?: (
		config: HuggingFaceEndpointManagementConfig,
	) => Promise<HuggingFaceEndpointMetadata>;
	maxWaitMs?: number;
	now?: () => number;
	sleep?: (milliseconds: number) => Promise<void>;
	updateRepository?: (
		config: HuggingFaceEndpointManagementConfig,
		repository: string,
	) => Promise<HuggingFaceEndpointMetadata>;
};

const requireSetting = (rows: SettingRow[], key: string) => {
	const value = rows.find((row) => row.key === key)?.value;
	if (value === undefined) {
		throw new Error(`${key} setting is missing`);
	}

	const normalized = value.trim();
	if (!normalized) {
		throw new Error(`${key} setting is empty`);
	}

	return normalized;
};

const optionalUrlSetting = (rows: SettingRow[], key: string) => {
	const normalized = rows.find((row) => row.key === key)?.value.trim();
	if (!normalized) {
		return undefined;
	}

	try {
		const url = new URL(normalized);
		if (url.protocol !== "http:" && url.protocol !== "https:") {
			throw new Error("unsupported protocol");
		}
	} catch {
		throw new Error(`${key} setting must be a valid HTTP(S) URL`);
	}

	return normalized.replace(/\/+$/u, "");
};

const requireToken = (token: string | undefined) => {
	const normalized = token?.trim();
	if (!normalized) {
		throw new Error("HF_TOKEN is not set");
	}
	return normalized;
};

export const parseHuggingFaceTextEndpointSettings = (
	rows: SettingRow[],
): HuggingFaceTextEndpointSettings => ({
	desiredRepository: requireSetting(rows, "textModel"),
	endpointName: requireSetting(rows, "hfTextInferenceEndpointName"),
	endpointUrl: optionalUrlSetting(rows, "hfTextInferenceEndpointUrl"),
	namespace: requireSetting(rows, "hfInferenceEndpointNamespace"),
});

const parseEndpointMetadata = (raw: unknown): HuggingFaceEndpointMetadata => {
	if (typeof raw !== "object" || raw === null) {
		throw new Error("Hugging Face endpoint metadata is not an object");
	}

	const metadata = raw as {
		model?: { repository?: unknown };
		status?: { state?: unknown; url?: unknown };
	};
	const repository = metadata.model?.repository;
	const status = metadata.status?.state;
	const url = metadata.status?.url;
	if (typeof repository !== "string" || typeof status !== "string") {
		throw new Error("Hugging Face endpoint metadata is missing repository/status");
	}

	return {
		repository,
		status,
		...(typeof url === "string" && url.trim()
			? { url: url.trim().replace(/\/+$/u, "") }
			: {}),
	};
};

const requestEndpointMetadata = async (
	url: string,
	config: HuggingFaceEndpointManagementConfig,
	init: RequestInit,
	fetcher: typeof fetch,
) => {
	const response = await fetcher(url, {
		...init,
		headers: {
			Accept: "application/json",
			Authorization: `Bearer ${config.token}`,
			...(init.body ? { "Content-Type": "application/json" } : {}),
			...init.headers,
		},
		signal: AbortSignal.timeout(HUGGING_FACE_MANAGEMENT_REQUEST_TIMEOUT_MS),
	});
	if (!response.ok) {
		const body = (await response.text()).trim();
		throw new Error(
			`Hugging Face endpoint management request failed with ${response.status}${body ? `: ${body}` : ""}`,
		);
	}

	return parseEndpointMetadata(await response.json());
};

const endpointResourceUrl = (config: HuggingFaceEndpointManagementConfig) =>
	`${HUGGING_FACE_ENDPOINTS_API_URL}/endpoint/${encodeURIComponent(config.namespace)}/${encodeURIComponent(config.endpointName)}`;

export const fetchHuggingFaceEndpointMetadata = async (
	config: HuggingFaceEndpointManagementConfig,
	fetcher: typeof fetch = globalThis.fetch,
) =>
	await requestEndpointMetadata(
		endpointResourceUrl(config),
		config,
		{ method: "GET" },
		fetcher,
	);

export const updateHuggingFaceEndpointRepository = async (
	config: HuggingFaceEndpointManagementConfig,
	repository: string,
	fetcher: typeof fetch = globalThis.fetch,
) =>
	await requestEndpointMetadata(
		endpointResourceUrl(config),
		config,
		{
			body: JSON.stringify({ model: { repository } }),
			method: "PUT",
		},
		fetcher,
	);

const sleep = async (milliseconds: number) => {
	await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
};

const assertEndpointNotFailed = (metadata: HuggingFaceEndpointMetadata) => {
	if (FAILED_ENDPOINT_STATES.has(metadata.status)) {
		throw new Error(
			`Hugging Face text endpoint entered ${metadata.status} state`,
		);
	}
};

export const reconcileHuggingFaceTextEndpointState = async (
	store: HuggingFaceTextEndpointStore,
	token: string,
	options: ReconcileOptions = {},
): Promise<ResolvedHuggingFaceTextEndpoint> => {
	const settings = await store.load();
	const managementConfig: HuggingFaceEndpointManagementConfig = {
		endpointName: settings.endpointName,
		namespace: settings.namespace,
		token: requireToken(token),
	};
	const fetchMetadata =
		options.fetchMetadata ??
		((currentConfig) => fetchHuggingFaceEndpointMetadata(currentConfig));
	const updateRepository =
		options.updateRepository ??
		((currentConfig, repository) =>
			updateHuggingFaceEndpointRepository(currentConfig, repository));
	const wait = options.sleep ?? sleep;
	const now = options.now ?? Date.now;
	const maxWaitMs = options.maxWaitMs ?? HUGGING_FACE_RECONCILE_MAX_WAIT_MS;
	const startedAt = now();

	let metadata = await fetchMetadata(managementConfig);
	assertEndpointNotFailed(metadata);
	if (metadata.repository !== settings.desiredRepository) {
		metadata = await updateRepository(
			managementConfig,
			settings.desiredRepository,
		);
		assertEndpointNotFailed(metadata);
	}

	while (
		metadata.repository !== settings.desiredRepository ||
		!READY_ENDPOINT_STATES.has(metadata.status) ||
		!metadata.url
	) {
		assertEndpointNotFailed(metadata);
		if (metadata.status === "paused") {
			throw new Error("Hugging Face text endpoint is paused");
		}
		if (now() - startedAt >= maxWaitMs) {
			throw new Error(
				`Timed out waiting for Hugging Face text endpoint (state: ${metadata.status}, repository: ${metadata.repository})`,
			);
		}

		await wait(HUGGING_FACE_RECONCILE_POLL_MS);
		metadata = await fetchMetadata(managementConfig);
	}

	await store.saveUrl(metadata.url);
	return {
		endpointUrl: metadata.url,
		managementConfig,
	};
};

const createEntityManagerStore = (em: EntityManager): HuggingFaceTextEndpointStore => ({
	load: async () => {
		// eslint-disable-next-line unicorn/no-array-method-this-argument
		const rows = await em.find(Setting, {
			key: { $in: [...HUGGING_FACE_TEXT_SETTING_KEYS] },
		});
		return parseHuggingFaceTextEndpointSettings(rows);
	},
	saveUrl: async (url) => {
		const key = "hfTextInferenceEndpointUrl";
		const setting = await em.findOne(Setting, { key });
		if (setting) {
			setting.value = url;
			await em.flush();
			return;
		}

		await em.persistAndFlush(em.create(Setting, { key, value: url }));
	},
});

let reconcileInFlight: Promise<ResolvedHuggingFaceTextEndpoint | undefined> | undefined;

export const reconcileHuggingFaceTextEndpoint = async (
	em: EntityManager,
): Promise<ResolvedHuggingFaceTextEndpoint | undefined> => {
	if (reconcileInFlight) {
		return await reconcileInFlight;
	}

	const currentReconcile = (async () => {
		const provider = await em.findOne(Setting, { key: "textProvider" });
		if (provider?.value !== "huggingface") {
			return undefined;
		}

		return await reconcileHuggingFaceTextEndpointState(
			createEntityManagerStore(em),
			requireToken(config.hfToken),
		);
	})();
	reconcileInFlight = currentReconcile;
	try {
		return await currentReconcile;
	} finally {
		if (reconcileInFlight === currentReconcile) {
			reconcileInFlight = undefined;
		}
	}
};

export const startHuggingFaceTextEndpointReconciler = (
	intervalMs = HUGGING_FACE_RECONCILE_INTERVAL_MS,
) => {
	let stopped = false;
	const reconcile = async () => {
		if (stopped) {
			return;
		}
		try {
			await reconcileHuggingFaceTextEndpoint(getOrm().em.fork());
		} catch (error) {
			logger.error("Hugging Face text endpoint reconciliation failed:", error);
		}
	};

	void reconcile();
	const timer = setInterval(() => {
		void reconcile();
	}, intervalMs);

	return () => {
		stopped = true;
		clearInterval(timer);
	};
};
