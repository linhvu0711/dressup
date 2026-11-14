import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useSignOutOn401, useUserId } from "../session";
import { type Look, type LookId, type LookInput, lookSchema } from "./look";

export const looksQueryKey = (userId: string | null) =>
	["looks", userId] as const;

const looksAnswer = z.object({ looks: z.array(lookSchema) });
const savedAnswer = z.object({ look: lookSchema });

export function useLooks() {
	const userId = useUserId();
	const on401 = useSignOutOn401();
	return useQuery({
		queryKey: looksQueryKey(userId),
		queryFn: async () => {
			const res = await fetch("/api/looks");
			await on401(res, "GET /api/looks");
			if (!res.ok) throw new Error(`GET /api/looks answered ${res.status}`);
			return looksAnswer.parse(await res.json()).looks;
		},
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

const errorAnswer = z.object({ error: z.string() });

export function useSaveLook() {
	const userId = useUserId();
	const queryClient = useQueryClient();
	const on401 = useSignOutOn401();
	return useMutation({
		mutationFn: async (look: LookInput) => {
			const res = await fetch("/api/looks", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(look),
			});
			await on401(res, "POST /api/looks");
			if (!res.ok) {
				const body = errorAnswer.safeParse(await res.json().catch(() => null));
				throw new SaveError(res.status, body.success ? body.data.error : null);
			}
			return savedAnswer.parse(await res.json()).look;
		},
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

export function useDeleteLook() {
	const userId = useUserId();
	const queryClient = useQueryClient();
	const on401 = useSignOutOn401();
	const forget = (id: LookId) => {
		queryClient.setQueryData<Look[]>(looksQueryKey(userId), (old) =>
			old?.filter((l) => l.id !== id),
		);
		// Not returned: a returned promise holds the caller's callbacks until
		// the list has loaded again.
		void queryClient.invalidateQueries({ queryKey: looksQueryKey(userId) });
	};
	return useMutation({
		mutationFn: async (id: LookId) => {
			const res = await fetch(`/api/looks/${id}`, { method: "DELETE" });
			await on401(res, "DELETE /api/looks/:id");
			if (res.status === 404) throw new LookGone();
			if (!res.ok)
				throw new Error(`DELETE /api/looks/:id answered ${res.status}`);
		},
		onSuccess: (_, id) => forget(id),
		onError: (error, id) => {
			if (error instanceof LookGone) forget(id);
		},
	});
}

export function useUpdateLook() {
	const userId = useUserId();
	const queryClient = useQueryClient();
	const on401 = useSignOutOn401();
	return useMutation({
		mutationFn: async (look: LookInput) => {
			const res = await fetch(`/api/looks/${look.id}`, {
				method: "PUT",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(look),
			});
			await on401(res, "PUT /api/looks/:id");
			if (res.status === 404) throw new LookGone();
			if (!res.ok) throw new Error(`PUT /api/looks/:id answered ${res.status}`);
			return savedAnswer.parse(await res.json()).look;
		},
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
