import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RequestError, request } from "../data/client";
import { aiAppsAnswer } from "../data/contract";
import { useUserId } from "../session";
import type { AiApp } from "./ai-app";

export const aiAppsQueryKey = (userId: string | null) =>
	["ai-apps", userId] as const;

export function useAiApps() {
	const userId = useUserId();
	return useQuery({
		queryKey: aiAppsQueryKey(userId),
		queryFn: async () =>
			(await request("GET", "/api/ai-apps", { answer: aiAppsAnswer })).apps,
		enabled: userId !== null,
		// "Try again" on the page is the person's way to try again, as for tags.
		retry: false,
	});
}

export function useDisconnectAiApp() {
	const userId = useUserId();
	const queryClient = useQueryClient();
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
		onSuccess: (_, id) => {
			queryClient.setQueryData<AiApp[]>(aiAppsQueryKey(userId), (old) =>
				old?.filter((app) => app.id !== id),
			);
			void queryClient.invalidateQueries({ queryKey: aiAppsQueryKey(userId) });
		},
	});
}
