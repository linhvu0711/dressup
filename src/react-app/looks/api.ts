import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { type Me, meQueryKey } from "../session";
import { type LookInput, lookSchema } from "./look";

export const looksQueryKey = (userId: string | null) =>
	["looks", userId] as const;

const looksAnswer = z.object({ looks: z.array(lookSchema) });
const savedAnswer = z.object({ look: lookSchema });

// The signed-in account, read from the session check's cache. useMe would
// check the session again each time a form or page mounts; the session gate
// rebuilds the page when the account changes, so the cached id holds.
function useUserId() {
	return useQueryClient().getQueryData<Me | null>(meQueryKey)?.id ?? null;
}

// A lost session makes the session check run again; it finds none, and the
// session gate shows the sign-in screen (as DressState does).
function useSignOutOn401() {
	const queryClient = useQueryClient();
	return async (res: Response, what: string) => {
		if (res.status === 401) {
			void queryClient.invalidateQueries({ queryKey: meQueryKey });
			throw new Error(`${what} answered 401`);
		}
	};
}

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
			if (!res.ok) throw new Error(`POST /api/looks answered ${res.status}`);
			return savedAnswer.parse(await res.json()).look;
		},
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: looksQueryKey(userId) }),
	});
}
