import { useMutation, useQuery } from "@tanstack/react-query";
import { after, cachedUserId, goneAsDone, keys, request } from "../data/client";
import { ownedItemAnswer, ownedItemsAnswer } from "../data/contract";
import type { PictureId } from "../pictures/picture";
import type { OwnedItemId } from "./owned-item";

export function useCloset({ enabled = true }: { enabled?: boolean } = {}) {
	const userId = cachedUserId();
	return useQuery({
		queryKey: keys.closet(userId),
		queryFn: async () =>
			(
				await request("GET", "/api/owned-items", {
					answer: ownedItemsAnswer,
				})
			).ownedItems,
		enabled: enabled && userId !== null,
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
			pictureIds: PictureId[];
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

export function useChangeOwnedItem() {
	const userId = cachedUserId();
	return useMutation({
		mutationFn: async ({
			id,
			...change
		}: {
			id: OwnedItemId;
			brandId: string | null;
			quantity: number;
			pictureIds: PictureId[];
		}) =>
			(
				await request("PUT", `/api/owned-items/${id}`, {
					body: change,
					answer: ownedItemAnswer,
				})
			).ownedItem,
		onSuccess: (item) => after.ownedItemChanged(userId, item),
	});
}

export function useDeleteOwnedItem() {
	const userId = cachedUserId();
	return useMutation({
		mutationFn: (id: OwnedItemId) =>
			request("DELETE", `/api/owned-items/${id}`).catch(goneAsDone),
		onSuccess: (_, id) => after.ownedItemDeleted(userId, id),
	});
}
