import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RequestError, request } from "../data/client";
import { tagAnswer, tagsAnswer } from "../data/contract";
import { looksQueryKey } from "../looks/api";
import { useUserId } from "../session";
import type { Tag, TagId } from "./tag";

export const tagsQueryKey = (userId: string | null) =>
	["tags", userId] as const;

export function useTags() {
	const userId = useUserId();
	return useQuery({
		queryKey: tagsQueryKey(userId),
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

export const addTagKey = ["tags", "add"] as const;

export function useAddTag() {
	const userId = useUserId();
	const queryClient = useQueryClient();
	return useMutation({
		mutationKey: addTagKey,
		mutationFn: async (name: string) =>
			(
				await request("POST", "/api/tags", {
					body: { name },
					answer: tagAnswer,
				}).catch(takenAsTagNameTaken)
			).tag,
		onSuccess: (tag) => {
			queryClient.setQueryData<Tag[]>(tagsQueryKey(userId), (old) =>
				old ? [...old, tag] : old,
			);
		},
		// On an error too: an add whose answer was lost may be stored, and
		// sending it again finds the name taken.
		onSettled: () => {
			void queryClient.invalidateQueries({ queryKey: tagsQueryKey(userId) });
		},
	});
}

export function useRenameTag() {
	const userId = useUserId();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (input: Tag) =>
			(
				await request("PUT", `/api/tags/${input.id}`, {
					body: input,
					answer: tagAnswer,
				}).catch(takenAsTagNameTaken)
			).tag,
		// The renamed tag keeps its place, as the server keeps its time.
		onSuccess: (tag) => {
			queryClient.setQueryData<Tag[]>(tagsQueryKey(userId), (old) =>
				old?.map((t) => (t.id === tag.id ? tag : t)),
			);
		},
		// A tag gone on another device, or a name taken there, shows on the
		// next load.
		onError: () => {
			void queryClient.invalidateQueries({ queryKey: tagsQueryKey(userId) });
		},
	});
}

export function useDeleteTag() {
	const userId = useUserId();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: TagId) =>
			request("DELETE", `/api/tags/${id}`).catch(goneAsDone),
		onSuccess: (_, id) => {
			queryClient.setQueryData<Tag[]>(tagsQueryKey(userId), (old) =>
				old?.filter((t) => t.id !== id),
			);
			void queryClient.invalidateQueries({ queryKey: tagsQueryKey(userId) });
			// The looks cache has one writer, looks/api.ts; until it loads again
			// the look view and the chips skip a tag the list no longer holds.
			void queryClient.invalidateQueries({ queryKey: looksQueryKey(userId) });
		},
	});
}
