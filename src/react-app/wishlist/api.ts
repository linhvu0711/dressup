import { useMutation, useQuery } from "@tanstack/react-query";
import { after, cachedUserId, goneAsDone, keys, request } from "../data/client";
import { ownedItemAnswer, wishAnswer, wishesAnswer } from "../data/contract";
import type { ShopLinkId, WishId } from "./wish";

export function useWishlist() {
	const userId = cachedUserId();
	return useQuery({
		queryKey: keys.wishlist(userId),
		queryFn: async () =>
			(await request("GET", "/api/wishes", { answer: wishesAnswer })).wishes,
		enabled: userId !== null,
		// "Retry" on the page is the person's way to try again.
		retry: false,
	});
}

export function useAddWish() {
	const userId = cachedUserId();
	return useMutation({
		mutationFn: async (wish: {
			id: WishId;
			typeId: string;
			colourId: string;
		}) =>
			(
				await request("POST", "/api/wishes", {
					body: wish,
					answer: wishAnswer,
				})
			).wish,
		onSuccess: (wish) => after.wishAdded(userId, wish),
	});
}

type ShopLinkFields = {
	url: string;
	brandId: string | null;
	name: string;
	price: number | null;
	pictureIds: string[];
};

export function useAddShopLink() {
	const userId = cachedUserId();
	return useMutation({
		mutationFn: async ({
			wishId,
			...link
		}: ShopLinkFields & { wishId: WishId; id: ShopLinkId }) =>
			(
				await request("POST", `/api/wishes/${wishId}/shop-links`, {
					body: link,
					answer: wishAnswer,
				})
			).wish,
		onSuccess: (wish) => after.wishChanged(userId, wish),
	});
}

export function useChangeShopLink() {
	const userId = cachedUserId();
	return useMutation({
		mutationFn: async ({
			id,
			...change
		}: ShopLinkFields & { id: ShopLinkId }) =>
			(
				await request("PUT", `/api/shop-links/${id}`, {
					body: change,
					answer: wishAnswer,
				})
			).wish,
		onSuccess: (wish) => after.wishChanged(userId, wish),
	});
}

export function useDeleteShopLink() {
	const userId = cachedUserId();
	return useMutation({
		mutationFn: (id: ShopLinkId) =>
			request("DELETE", `/api/shop-links/${id}`).catch(goneAsDone),
		onSuccess: (_, id) => after.shopLinkDeleted(userId, id),
	});
}

export function useDeleteWish() {
	const userId = cachedUserId();
	return useMutation({
		mutationFn: (id: WishId) =>
			request("DELETE", `/api/wishes/${id}`).catch(goneAsDone),
		onSuccess: (_, id) => after.wishDeleted(userId, id),
	});
}

export function useMarkBought(wishId: WishId) {
	const userId = cachedUserId();
	return useMutation({
		mutationFn: async (id: ShopLinkId) =>
			(
				await request("POST", `/api/shop-links/${id}/bought`, {
					answer: ownedItemAnswer,
				})
			).ownedItem,
		onSuccess: (item) => after.shopLinkBought(userId, item, wishId),
	});
}
