const HUGGING_FACE_ENDPOINTS_API_URL =
	"https://api.endpoints.huggingface.cloud/v2";
const HUGGING_FACE_MANAGEMENT_REQUEST_TIMEOUT_MS = 15_000;

type HuggingFaceEndpointManagementConfigInput = {
	endpointName: string | undefined;
	namespace: string | undefined;
	token: string | undefined;
};

export type HuggingFaceEndpointManagementConfig = {
	endpointName: string;
	namespace: string;
	token: string;
};

type HuggingFaceEndpointLifecycleOptions = {
	onScaleError?: (error: unknown) => void;
	scaleToZero: () => Promise<void>;
};

const requireValue = (
	value: string | undefined,
	variableName: string,
): string => {
	const normalizedValue = value?.trim();
	if (!normalizedValue) {
		throw new Error(`${variableName} is not set`);
	}

	return normalizedValue;
};

export const requireHuggingFaceEndpointManagementConfig = (
	input: HuggingFaceEndpointManagementConfigInput,
): HuggingFaceEndpointManagementConfig => ({
	endpointName: requireValue(
		input.endpointName,
		"HF_TEXT_INFERENCE_ENDPOINT_NAME",
	),
	namespace: requireValue(
		input.namespace,
		"HF_INFERENCE_ENDPOINT_NAMESPACE",
	),
	token: requireValue(input.token, "HF_TOKEN"),
});

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
	scaleToZero,
}: HuggingFaceEndpointLifecycleOptions) => {
	let activeRequests = 0;
	let scaleToZeroInFlight: Promise<void> | undefined;

	const waitForScaleToZero = async () => {
		if (scaleToZeroInFlight) {
			await scaleToZeroInFlight;
		}
	};

	const finishRequest = async () => {
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
				await scaleToZero();
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
		run: async <T>(task: () => Promise<T>): Promise<T> => {
			await waitForScaleToZero();
			activeRequests += 1;
			try {
				return await task();
			} finally {
				await finishRequest();
			}
		},
	};
};
