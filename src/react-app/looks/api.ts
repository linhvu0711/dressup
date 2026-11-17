import { useMutation, useQuery } from "@tanstack/react-query";
import { after, keys, RequestError, request } from "../data/client";
import { lookAnswer, looksAnswer } from "../data/contract";
import { useUserId } from "../session";
import type { LookId, LookInput } from "./look";

export function useLooks() {
	const userId = useUserId();
	return useQuery({
		queryKey: keys.looks(userId),
		queryFn: async () =>
			(await request("GET", "/api/looks", { answer: looksAnswer })).looks,
		enabled: userId !== null,
		// "Retry" on the page is the person's way to try again; three silent
		// retries would hold the skeletons for about 7 s first.
		retry: false,
	});
}

// A refused save, with the error code of its answer when it names one, so
// the form can tell the look limit from a save that failed.
export class SaveError extends Error {
	constructor(
		readonly status: number,
		readonly code: string | null,
	) {
		super(`POST /api/looks answered ${status}`);
	}
}

export function useSaveLook() {
	const userId = useUserId();
	return useMutation({
		mutationFn: async (look: LookInput) =>
			(
				await request("POST", "/api/looks", {
					body: look,
					answer: lookAnswer,
				})
			).look,
		onSuccess: (look) => after.lookSaved(userId, look),
	});
}

// The look is not there: deleted on another device, or another account's.
export class LookGone extends Error {}

const goneAsLookGone = (error: unknown): never => {
	if (error instanceof RequestError && error.code === "not_found")
		throw new LookGone();
	throw error;
};

export function useDeleteLook() {
	const userId = useUserId();
	return useMutation({
		mutationFn: (id: LookId) =>
			request("DELETE", `/api/looks/${id}`).catch(goneAsLookGone),
		onSuccess: (_, id) => after.lookGone(userId, id),
		onError: (error, id) => {
			if (error instanceof LookGone) after.lookGone(userId, id);
		},
	});
}

export function useUpdateLook() {
	const userId = useUserId();
	return useMutation({
		mutationFn: async (look: LookInput) =>
			(
				await request("PUT", `/api/looks/${look.id}`, {
					body: look,
					answer: lookAnswer,
				}).catch(goneAsLookGone)
			).look,
		onSuccess: (look) => after.lookChanged(userId, look),
		onError: (error, look) => {
			if (error instanceof LookGone) after.lookGone(userId, look.id);
		},
	});
}
