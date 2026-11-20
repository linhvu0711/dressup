import { useMutation, useQuery } from "@tanstack/react-query";
import { after, cachedUserId, keys, remove, request } from "../data/client";
import { tagAnswer, tagsAnswer } from "../data/contract";
import type { Tag, TagId } from "./tag";

export function useTags() {
	const userId = cachedUserId();
	return useQuery({
		queryKey: keys.tags(userId),
		queryFn: async () =>
			(await request("GET", "/api/tags", { answer: tagsAnswer })).tags,
		enabled: userId !== null,
	});
}

export function useAddTag() {
	const userId = cachedUserId();
	return useMutation({
		mutationKey: keys.addTag,
		mutationFn: async (name: string) =>
			(
				await request("POST", "/api/tags", {
					body: { name },
					answer: tagAnswer,
				})
			).tag,
		onSuccess: (tag) => after.tagAdded(userId, tag),
		// On an error too: an add whose answer was lost may be stored, and
		// sending it again finds the name taken.
		onSettled: () => after.tagsMayDiffer(userId),
	});
}

export function useRenameTag() {
	const userId = cachedUserId();
	return useMutation({
		mutationFn: async (input: Tag) =>
			(
				await request("PUT", `/api/tags/${input.id}`, {
					body: input,
					answer: tagAnswer,
				})
			).tag,
		onSuccess: (tag) => after.tagRenamed(userId, tag),
		// A tag gone on another device, or a name taken there, shows on the
		// next load.
		onError: () => after.tagsMayDiffer(userId),
	});
}

export function useDeleteTag() {
	const userId = cachedUserId();
	return useMutation({
		mutationFn: (id: TagId) => remove(`/api/tags/${id}`),
		onSuccess: (_, id) => after.tagDeleted(userId, id),
	});
}
