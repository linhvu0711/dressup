import { useMutation, useQuery } from "@tanstack/react-query";
import {
	after,
	cachedUserId,
	isGone,
	keys,
	remove,
	request,
} from "../data/client";
import { combinationAnswer, combinationsAnswer } from "../data/contract";
import type { CombinationBody, CombinationId } from "./combination";

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
	});
}

export function useSaveCombination() {
	const userId = cachedUserId();
	return useMutation({
		mutationFn: async (combination: CombinationBody) =>
			(
				await request("POST", "/api/combinations", {
					body: combination,
					answer: combinationAnswer,
				})
			).combination,
		onSuccess: (combination) => after.combinationSaved(userId, combination),
		// A tag gone on another device refuses the save: drop it from the chips.
		onError: () => after.tagsMayDiffer(userId),
	});
}

export function useDeleteCombination() {
	const userId = cachedUserId();
	return useMutation({
		mutationFn: (id: CombinationId) => remove(`/api/combinations/${id}`),
		onSuccess: (_, id) => after.combinationGone(userId, id),
	});
}

// The changed combination keeps its place, as combinationSaved keeps a
// combination with the same id.
export function useChangeCombination() {
	const userId = cachedUserId();
	return useMutation({
		mutationFn: async (combination: CombinationBody) =>
			(
				await request("PUT", `/api/combinations/${combination.id}`, {
					body: combination,
					answer: combinationAnswer,
				})
			).combination,
		onSuccess: (combination) => after.combinationSaved(userId, combination),
		onError: (error, combination) => {
			if (isGone(error)) after.combinationGone(userId, combination.id);
			after.tagsMayDiffer(userId);
		},
	});
}
