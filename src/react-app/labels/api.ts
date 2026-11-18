import { useMutation, useQuery } from "@tanstack/react-query";
import { after, cachedUserId, keys, request } from "../data/client";
import { colourAnswer, coloursAnswer } from "../data/contract";

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

export function useAddColour() {
	const userId = cachedUserId();
	return useMutation({
		mutationFn: async (input: { name: string; hex: string }) =>
			(
				await request("POST", "/api/colours", {
					body: input,
					answer: colourAnswer,
				})
			).colour,
		onSuccess: (colour) => after.colourAdded(userId, colour),
		// On an error too: an add whose answer was lost may be stored, and
		// sending it again finds the name taken.
		onSettled: () => after.coloursMayDiffer(userId),
	});
}
