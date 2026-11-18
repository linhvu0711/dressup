import { useQuery } from "@tanstack/react-query";
import { cachedUserId, keys, request } from "../data/client";
import { coloursAnswer } from "../data/contract";

export function useColours() {
	const userId = cachedUserId();
	return useQuery({
		queryKey: keys.colours(userId),
		queryFn: async () =>
			(await request("GET", "/api/colours", { answer: coloursAnswer })).colours,
		enabled: userId !== null,
		// "Retry" on the page is the person's way to try again, as for looks.
		retry: false,
	});
}
