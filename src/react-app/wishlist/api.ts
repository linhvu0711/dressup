import { useMutation, useQuery } from "@tanstack/react-query";
import type { z } from "zod";
import { after, cachedUserId, keys, remove, request } from "../data/client";
import { ownedItemAnswer, wishAnswer, wishesAnswer } from "../data/contract";
import type {
	ShopLinkId,
	shopLinkChangeSchema,
	shopLinkInputSchema,
	WishId,
	wishlistAddSchema,
} from "./wish";

export function useWishlist() {
	const userId = cachedUserId();
	return useQuery({
		queryKey: keys.wishlist(userId),
		queryFn: async () =>
			(await request("GET", "/api/wishes", { answer: wishesAnswer })).wishes,
		enabled: userId !== null,
	});
}

// One request adds the wish with its first shop link, or joins the link to
// the wish the piece has; it answers the whole wish.
export function useAddToWishlist() {
	const userId = cachedUserId();
	return useMutation({
		mutationFn: async (body: z.infer<typeof wishlistAddSchema>) =>
			(
				await request("POST", "/api/wishlist", {
					body,
					answer: wishAnswer,
				})
			).wish,
		onSuccess: (wish) => after.wishAdded(userId, wish),
	});
}

export function useAddShopLink() {
	const userId = cachedUserId();
	return useMutation({
		mutationFn: async ({
			wishId,
			...link
		}: z.infer<typeof shopLinkInputSchema> & { wishId: WishId }) =>
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
		}: z.infer<typeof shopLinkChangeSchema> & { id: ShopLinkId }) =>
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
		mutationFn: (id: ShopLinkId) => remove(`/api/shop-links/${id}`),
		onSuccess: (_, id) => after.shopLinkDeleted(userId, id),
	});
}

export function useDeleteWish() {
	const userId = cachedUserId();
	return useMutation({
		mutationFn: (id: WishId) => remove(`/api/wishes/${id}`),
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
