import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { keys, RequestError, request } from "../data/client";
import { lookAnswer, looksAnswer } from "../data/contract";
import { useUserId } from "../session";
import type { Look, LookId, LookInput } from "./look";

export const looksQueryKey = keys.looks;

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
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (look: LookInput) =>
			(
				await request("POST", "/api/looks", {
					body: look,
					answer: lookAnswer,
				})
			).look,
		onSuccess: (look) => {
			// The wall shows a cached list at once while it asks the server
			// again, so the saved look goes into that list now, or a first
			// visit's empty list would show "No looks yet" after a save. A look
			// saved again keeps its place, as the server keeps its time.
			queryClient.setQueryData<Look[]>(
				looksQueryKey(userId),
				(old) =>
					old &&
					(old.some((l) => l.id === look.id)
						? old.map((l) => (l.id === look.id ? look : l))
						: [look, ...old]),
			);
			return queryClient.invalidateQueries({
				queryKey: looksQueryKey(userId),
			});
		},
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
	const queryClient = useQueryClient();
	const forget = (id: LookId) => {
		queryClient.setQueryData<Look[]>(looksQueryKey(userId), (old) =>
			old?.filter((l) => l.id !== id),
		);
		// Not returned: a returned promise holds the caller's callbacks until
		// the list has loaded again.
		void queryClient.invalidateQueries({ queryKey: looksQueryKey(userId) });
	};
	return useMutation({
		mutationFn: (id: LookId) =>
			request("DELETE", `/api/looks/${id}`).catch(goneAsLookGone),
		onSuccess: (_, id) => forget(id),
		onError: (error, id) => {
			if (error instanceof LookGone) forget(id);
		},
	});
}

export function useUpdateLook() {
	const userId = useUserId();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (look: LookInput) =>
			(
				await request("PUT", `/api/looks/${look.id}`, {
					body: look,
					answer: lookAnswer,
				}).catch(goneAsLookGone)
			).look,
		onSuccess: (look) => {
			// The changed look keeps its place, as the server keeps its time.
			queryClient.setQueryData<Look[]>(looksQueryKey(userId), (old) =>
				old?.map((l) => (l.id === look.id ? look : l)),
			);
			void queryClient.invalidateQueries({ queryKey: looksQueryKey(userId) });
		},
		onError: (error, look) => {
			if (!(error instanceof LookGone)) return;
			queryClient.setQueryData<Look[]>(looksQueryKey(userId), (old) =>
				old?.filter((l) => l.id !== look.id),
			);
			void queryClient.invalidateQueries({ queryKey: looksQueryKey(userId) });
		},
	});
}
