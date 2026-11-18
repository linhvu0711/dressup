import { useMutation, useQuery } from "@tanstack/react-query";
import {
	after,
	cachedUserId,
	keys,
	RequestError,
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
		// "Retry" on the page is the person's way to try again, as on Looks.
		retry: false,
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

// The server no longer has the combination: deleted on another device.
export class CombinationGone extends Error {}

const goneAsCombinationGone = (error: unknown): never => {
	if (error instanceof RequestError && error.code === "not_found")
		throw new CombinationGone();
	throw error;
};

export function useDeleteCombination() {
	const userId = cachedUserId();
	return useMutation({
		mutationFn: (id: CombinationId) =>
			request("DELETE", `/api/combinations/${id}`).catch(goneAsCombinationGone),
		onSuccess: (_, id) => after.combinationGone(userId, id),
		onError: (error, id) => {
			if (error instanceof CombinationGone) after.combinationGone(userId, id);
		},
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
				}).catch(goneAsCombinationGone)
			).combination,
		onSuccess: (combination) => after.combinationSaved(userId, combination),
		onError: (error, combination) => {
			if (error instanceof CombinationGone)
				after.combinationGone(userId, combination.id);
			after.tagsMayDiffer(userId);
		},
	});
}
