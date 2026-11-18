import { useQuery } from "@tanstack/react-query";
import { cachedUserId, keys, request } from "../data/client";
import { ownedItemsAnswer } from "../data/contract";

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
