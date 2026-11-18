import { useQuery } from "@tanstack/react-query";
import { cachedUserId, keys, request } from "../data/client";
import { combinationsAnswer } from "../data/contract";

export function useCombinations() {
	const userId = cachedUserId();
	return useQuery({
		queryKey: keys.combinations(userId),
		queryFn: async () =>
			(
				await request("GET", "/api/combinations", {
					answer: combinationsAnswer,
				})
			).combinations,
		enabled: userId !== null,
		// "Retry" on the page is the person's way to try again, as on Looks.
		retry: false,
	});
}
