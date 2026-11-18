import { useMutation, useQuery } from "@tanstack/react-query";
import { after, cachedUserId, keys, request } from "../data/client";
import { wishAnswer, wishesAnswer } from "../data/contract";
import type { WishId } from "./wish";

export function useWishlist() {
	const userId = cachedUserId();
	return useQuery({
		queryKey: keys.wishlist(userId),
		queryFn: async () =>
			(await request("GET", "/api/wishes", { answer: wishesAnswer })).wishes,
		enabled: userId !== null,
		// "Retry" on the page is the person's way to try again, as on Looks.
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
