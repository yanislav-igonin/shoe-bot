type PersistedGenerationOptions<Result> = {
	generate: () => Promise<Result>;
	persistRequest: () => Promise<void>;
	persistResponse: (result: Result) => Promise<void>;
};

export const runPersistedGeneration = async <Result>({
	generate,
	persistRequest,
	persistResponse,
}: PersistedGenerationOptions<Result>) => {
	await persistRequest();
	const result = await generate();
	await persistResponse(result);

	return result;
};
