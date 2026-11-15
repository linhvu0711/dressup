import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useSignOutOn401, useUserId } from "../session";
import { type AiApp, aiAppSchema } from "./ai-app";

export const aiAppsQueryKey = (userId: string | null) =>
	["ai-apps", userId] as const;

const aiAppsAnswer = z.object({ apps: z.array(aiAppSchema) });

export function useAiApps() {
	const userId = useUserId();
	const on401 = useSignOutOn401();
	return useQuery({
		queryKey: aiAppsQueryKey(userId),
		queryFn: async () => {
			const res = await fetch("/api/ai-apps");
			await on401(res, "GET /api/ai-apps");
			if (!res.ok) throw new Error(`GET /api/ai-apps answered ${res.status}`);
			return aiAppsAnswer.parse(await res.json()).apps;
		},
		enabled: userId !== null,
		// "Try again" on the page is the person's way to try again, as for tags.
		retry: false,
	});
}

export function useDisconnectAiApp() {
	const userId = useUserId();
	const queryClient = useQueryClient();
	const on401 = useSignOutOn401();
	return useMutation({
		mutationFn: async (id: string) => {
			const res = await fetch(`/api/ai-apps/${encodeURIComponent(id)}`, {
				method: "DELETE",
			});
			await on401(res, "DELETE /api/ai-apps/:id");
			// 404: disconnected on another device already, which is what was asked.
			if (!res.ok && res.status !== 404)
				throw new Error(`DELETE /api/ai-apps/:id answered ${res.status}`);
		},
		onSuccess: (_, id) => {
			queryClient.setQueryData<AiApp[]>(aiAppsQueryKey(userId), (old) =>
				old?.filter((app) => app.id !== id),
			);
			void queryClient.invalidateQueries({ queryKey: aiAppsQueryKey(userId) });
		},
	});
}
