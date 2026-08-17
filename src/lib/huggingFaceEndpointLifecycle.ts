const HUGGING_FACE_ENDPOINTS_API_URL =
	"https://api.endpoints.huggingface.cloud/v2";
const HUGGING_FACE_MANAGEMENT_REQUEST_TIMEOUT_MS = 15_000;

export type HuggingFaceEndpointManagementConfig = {
	endpointName: string;
	namespace: string;
	token: string;
};

type HuggingFaceEndpointLifecycleOptions = {
	onScaleError?: (error: unknown) => void;
	scaleToZero?: (config: HuggingFaceEndpointManagementConfig) => Promise<void>;
};

export const scaleHuggingFaceEndpointToZero = async (
	config: HuggingFaceEndpointManagementConfig,
	fetcher: typeof fetch = globalThis.fetch,
) => {
	const namespace = encodeURIComponent(config.namespace);
	const endpointName = encodeURIComponent(config.endpointName);
	const response = await fetcher(
		`${HUGGING_FACE_ENDPOINTS_API_URL}/endpoint/${namespace}/${endpointName}/scale-to-zero`,
		{
			headers: {
				Accept: "application/json",
				Authorization: `Bearer ${config.token}`,
			},
			method: "POST",
			signal: AbortSignal.timeout(HUGGING_FACE_MANAGEMENT_REQUEST_TIMEOUT_MS),
		},
	);

	if (response.ok) {
		return;
	}

	const body = (await response.text()).trim();
	throw new Error(
		`Hugging Face scale-to-zero failed with ${response.status}${body ? `: ${body}` : ""}`,
	);
};

export const createHuggingFaceEndpointLifecycle = ({
	onScaleError,
	scaleToZero = scaleHuggingFaceEndpointToZero,
}: HuggingFaceEndpointLifecycleOptions = {}) => {
	let activeRequests = 0;
	let scaleToZeroInFlight: Promise<void> | undefined;

	const waitForScaleToZero = async () => {
		if (scaleToZeroInFlight) {
			await scaleToZeroInFlight;
		}
	};

	const finishRequest = async (
		managementConfig: HuggingFaceEndpointManagementConfig,
	) => {
		activeRequests -= 1;
		if (activeRequests > 0) {
			return;
		}

		if (activeRequests < 0) {
			activeRequests = 0;
			throw new Error("Hugging Face active request count became negative");
		}

		const currentScale = (async () => {
			try {
				await scaleToZero(managementConfig);
			} catch (error) {
				onScaleError?.(error);
			}
		})();
		scaleToZeroInFlight = currentScale;
		await currentScale;
		if (scaleToZeroInFlight === currentScale) {
			scaleToZeroInFlight = undefined;
		}
	};

	return {
		run: async <T>(
			managementConfig: HuggingFaceEndpointManagementConfig,
			task: () => Promise<T>,
		): Promise<T> => {
			await waitForScaleToZero();
			activeRequests += 1;
			try {
				return await task();
			} finally {
				await finishRequest(managementConfig);
			}
		},
	};
};
