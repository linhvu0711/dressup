import { useMutation, useQuery } from "@tanstack/react-query";
import { after, cachedUserId, goneAsDone, keys, request } from "../data/client";
import { brandAnswer, brandsAnswer } from "../data/contract";
import type { Brand, BrandId } from "./brand";

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

export function useRenameBrand() {
	const userId = cachedUserId();
	return useMutation({
		mutationFn: async (input: Brand) =>
			(
				await request("PUT", `/api/brands/${input.id}`, {
					body: input,
					answer: brandAnswer,
				})
			).brand,
		onSuccess: (brand) => after.brandChanged(userId, brand),
		// A brand gone on another device, or a name taken there, shows on the
		// next load.
		onError: () => after.brandsMayDiffer(userId),
	});
}

export function useDeleteBrand() {
	const userId = cachedUserId();
	return useMutation({
		mutationFn: (id: BrandId) =>
			request("DELETE", `/api/brands/${id}`).catch(goneAsDone),
		onSuccess: (_, id) => after.brandDeleted(userId, id),
	});
}
