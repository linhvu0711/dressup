import { useMutation, useQuery } from "@tanstack/react-query";
import { after, cachedUserId, goneAsDone, keys, request } from "../data/client";
import { aiAppsAnswer } from "../data/contract";

export function useAiApps() {
	const userId = cachedUserId();
	return useQuery({
		queryKey: keys.aiApps(userId),
		queryFn: async () =>
			(await request("GET", "/api/ai-apps", { answer: aiAppsAnswer })).apps,
		enabled: userId !== null,
	});
}

export function useDisconnectAiApp() {
	const userId = cachedUserId();
	return useMutation({
		mutationFn: (id: string) =>
			request("DELETE", `/api/ai-apps/${encodeURIComponent(id)}`).catch(
				goneAsDone,
			),
		onSuccess: (_, id) => after.aiAppGone(userId, id),
	});
}
