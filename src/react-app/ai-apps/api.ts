import { useMutation, useQuery } from "@tanstack/react-query";
import { after, keys, RequestError, request } from "../data/client";
import { aiAppsAnswer } from "../data/contract";
import { useUserId } from "../session";

export function useAiApps() {
	const userId = useUserId();
	return useQuery({
		queryKey: keys.aiApps(userId),
		queryFn: async () =>
			(await request("GET", "/api/ai-apps", { answer: aiAppsAnswer })).apps,
		enabled: userId !== null,
		// "Try again" on the page is the person's way to try again, as for tags.
		retry: false,
	});
}

export function useDisconnectAiApp() {
	const userId = useUserId();
	return useMutation({
		mutationFn: (id: string) =>
			request("DELETE", `/api/ai-apps/${encodeURIComponent(id)}`).catch(
				(error: unknown) => {
					// Not found: disconnected on another device already, which is
					// what was asked.
					if (!(error instanceof RequestError && error.code === "not_found"))
						throw error;
				},
			),
		onSuccess: (_, id) => after.aiAppGone(userId, id),
	});
}
