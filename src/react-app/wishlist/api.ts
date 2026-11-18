import { useQuery } from "@tanstack/react-query";
import { cachedUserId, keys, request } from "../data/client";
import { wishesAnswer } from "../data/contract";

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
