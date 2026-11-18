import { useMutation, useQuery } from "@tanstack/react-query";
import { after, cachedUserId, keys, request } from "../data/client";
import { ownedItemAnswer, ownedItemsAnswer } from "../data/contract";
import type { OwnedItemId } from "./owned-item";

export function useCloset() {
	const userId = cachedUserId();
	return useQuery({
		queryKey: keys.closet(userId),
		queryFn: async () =>
			(
				await request("GET", "/api/owned-items", {
					answer: ownedItemsAnswer,
				})
			).ownedItems,
		enabled: userId !== null,
		// "Retry" on the page is the person's way to try again, as on Looks.
		retry: false,
	});
}

export function useAddOwnedItem() {
	const userId = cachedUserId();
	return useMutation({
		mutationFn: async (item: {
			id: OwnedItemId;
			typeId: string;
			colourId: string;
			brandId: string | null;
			quantity: number;
		}) =>
			(
				await request("POST", "/api/owned-items", {
					body: item,
					answer: ownedItemAnswer,
				})
			).ownedItem,
		onSuccess: (item) => after.ownedItemAdded(userId, item),
	});
}
