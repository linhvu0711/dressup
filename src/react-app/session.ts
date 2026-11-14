import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

const meSchema = z.object({
	id: z.string(),
	name: z.string(),
	email: z.string(),
	image: z.string().nullable(),
});

export type Me = z.infer<typeof meSchema>;

export const meQueryKey = ["me"] as const;

async function fetchMe(): Promise<Me | null> {
	const res = await fetch("/api/me");
	if (res.status === 401) return null;
	if (!res.ok) throw new Error(`GET /api/me answered ${res.status}`);
	return meSchema.parse(await res.json());
}

export function useMe() {
	return useQuery({ queryKey: meQueryKey, queryFn: fetchMe, retry: false });
}

// The signed-in account, read from the session check's cache. useMe would
// check the session again each time a form or page mounts; the session gate
// rebuilds the page when the account changes, so the cached id holds.
export function useUserId() {
	return useQueryClient().getQueryData<Me | null>(meQueryKey)?.id ?? null;
}

// A lost session makes the session check run again; it finds none, and the
// session gate shows the sign-in screen (as DressState does).
export function useSignOutOn401() {
	const queryClient = useQueryClient();
	return async (res: Response, what: string) => {
		if (res.status === 401) {
			void queryClient.invalidateQueries({ queryKey: meQueryKey });
			throw new Error(`${what} answered 401`);
		}
	};
}
