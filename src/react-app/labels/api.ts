import { useMutation, useQuery } from "@tanstack/react-query";
import {
	after,
	cachedUserId,
	goneAsDone,
	keys,
	RequestError,
	request,
} from "../data/client";
import { colourAnswer, coloursAnswer } from "../data/contract";
import type { Colour, ColourId } from "./colour";

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

export function useChangeColour() {
	const userId = cachedUserId();
	return useMutation({
		mutationFn: async (input: Colour) =>
			(
				await request("PUT", `/api/colours/${input.id}`, {
					body: input,
					answer: colourAnswer,
				})
			).colour,
		onSuccess: (colour) => after.colourChanged(userId, colour),
		// A colour gone on another device, or a name taken there, shows on the
		// next load.
		onError: () => after.coloursMayDiffer(userId),
	});
}

export function useDeleteColour() {
	const userId = cachedUserId();
	return useMutation({
		mutationFn: (id: ColourId) =>
			request("DELETE", `/api/colours/${id}`).catch(goneAsDone),
		onSuccess: (_, id) => after.colourDeleted(userId, id),
		// The list did not know a combination uses it.
		onError: (error) => {
			if (error instanceof RequestError && error.code === "colour_in_use")
				after.coloursMayDiffer(userId);
		},
	});
}
