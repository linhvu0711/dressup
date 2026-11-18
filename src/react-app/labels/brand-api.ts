import { useMutation, useQuery } from "@tanstack/react-query";
import { after, cachedUserId, keys, request } from "../data/client";
import { brandAnswer, brandsAnswer } from "../data/contract";

export function useBrands() {
	const userId = cachedUserId();
	return useQuery({
		queryKey: keys.brands(userId),
		queryFn: async () =>
			(await request("GET", "/api/brands", { answer: brandsAnswer })).brands,
		enabled: userId !== null,
		// "Retry" on the page is the person's way to try again, as for colours.
		retry: false,
	});
}

export function useAddBrand() {
	const userId = cachedUserId();
	return useMutation({
		mutationFn: async (name: string) =>
			(
				await request("POST", "/api/brands", {
					body: { name },
					answer: brandAnswer,
				})
			).brand,
		onSuccess: (brand) => after.brandAdded(userId, brand),
		// On an error too: an add whose answer was lost may be stored, and
		// sending it again finds the name taken.
		onSettled: () => after.brandsMayDiffer(userId),
	});
}
