import { useMutation, useQuery } from "@tanstack/react-query";
import { after, cachedUserId, keys, request } from "../data/client";
import { combinationAnswer, combinationsAnswer } from "../data/contract";
import type { CombinationInput } from "./combination";

export function useCombinations() {
	const userId = cachedUserId();
	return useQuery({
		queryKey: keys.combinations(userId),
		queryFn: async () =>
			(
				await request("GET", "/api/combinations", {
					answer: combinationsAnswer,
				})
			).combinations,
		enabled: userId !== null,
		// "Retry" on the page is the person's way to try again, as on Looks.
		retry: false,
	});
}

export function useSaveCombination() {
	const userId = cachedUserId();
	return useMutation({
		mutationFn: async (combination: CombinationInput) =>
			(
				await request("POST", "/api/combinations", {
					body: combination,
					answer: combinationAnswer,
				})
			).combination,
		onSuccess: (combination) => after.combinationSaved(userId, combination),
	});
}
