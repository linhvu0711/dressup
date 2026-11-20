import { useMutation, useQuery } from "@tanstack/react-query";
import type { Hex } from "@/colour/hex";
import { after, cachedUserId, keys, request } from "../data/client";
import { mannequinAnswer } from "../data/contract";
import type { MannequinPart } from "./mannequin";

export function useMannequin({ refetchOnMount = true } = {}) {
	const userId = cachedUserId();
	return useQuery({
		queryKey: keys.mannequin(userId),
		queryFn: async () =>
			(await request("GET", "/api/mannequin", { answer: mannequinAnswer }))
				.mannequin,
		enabled: userId !== null,
		// "Try again" on the page is the person's way to try again, as for
		// brands.
		retry: false,
		refetchOnMount,
	});
}

export function useSetMannequinColour() {
	const userId = cachedUserId();
	return useMutation({
		mutationFn: async ({ part, hex }: { part: MannequinPart; hex: Hex }) =>
			(
				await request("PUT", `/api/mannequin/${part}`, {
					body: { hex },
					answer: mannequinAnswer,
				})
			).mannequin,
		onSuccess: (mannequin, { part }) =>
			after.mannequinSet(userId, part, mannequin),
		onSettled: () => after.mannequinSaveEnded(userId),
	});
}
