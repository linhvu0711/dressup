import { useMutation, useQuery } from "@tanstack/react-query";
import { after, keys, RequestError, request } from "../data/client";
import { tagAnswer, tagsAnswer } from "../data/contract";
import { useUserId } from "../session";
import type { Tag, TagId } from "./tag";

export function useTags() {
	const userId = useUserId();
	return useQuery({
		queryKey: keys.tags(userId),
		queryFn: async () =>
			(await request("GET", "/api/tags", { answer: tagsAnswer })).tags,
		enabled: userId !== null,
		// "Retry" on the page is the person's way to try again, as for looks.
		retry: false,
	});
}

// The account has a tag of this name already, in some letter case.
export class TagNameTaken extends Error {}

const takenAsTagNameTaken = (error: unknown): never => {
	if (error instanceof RequestError && error.code === "duplicate")
		throw new TagNameTaken();
	throw error;
};

// Not found: deleted on another device already, which is what was asked.
const goneAsDone = (error: unknown) => {
	if (!(error instanceof RequestError && error.code === "not_found"))
		throw error;
};

export function useAddTag() {
	const userId = useUserId();
	return useMutation({
		mutationKey: keys.addTag,
		mutationFn: async (name: string) =>
			(
				await request("POST", "/api/tags", {
					body: { name },
					answer: tagAnswer,
				}).catch(takenAsTagNameTaken)
			).tag,
		onSuccess: (tag) => after.tagAdded(userId, tag),
		// On an error too: an add whose answer was lost may be stored, and
		// sending it again finds the name taken.
		onSettled: () => after.tagsMayDiffer(userId),
	});
}

export function useRenameTag() {
	const userId = useUserId();
	return useMutation({
		mutationFn: async (input: Tag) =>
			(
				await request("PUT", `/api/tags/${input.id}`, {
					body: input,
					answer: tagAnswer,
				}).catch(takenAsTagNameTaken)
			).tag,
		onSuccess: (tag) => after.tagRenamed(userId, tag),
		// A tag gone on another device, or a name taken there, shows on the
		// next load.
		onError: () => after.tagsMayDiffer(userId),
	});
}

export function useDeleteTag() {
	const userId = useUserId();
	return useMutation({
		mutationFn: (id: TagId) =>
			request("DELETE", `/api/tags/${id}`).catch(goneAsDone),
		onSuccess: (_, id) => after.tagDeleted(userId, id),
	});
}
