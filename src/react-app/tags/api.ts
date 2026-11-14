import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useSignOutOn401, useUserId } from "../session";
import { type Tag, tagSchema } from "./tag";

export const tagsQueryKey = (userId: string | null) =>
	["tags", userId] as const;

const tagsAnswer = z.object({ tags: z.array(tagSchema) });
const tagAnswer = z.object({ tag: tagSchema });
const errorAnswer = z.object({ error: z.string() });

export function useTags() {
	const userId = useUserId();
	const on401 = useSignOutOn401();
	return useQuery({
		queryKey: tagsQueryKey(userId),
		queryFn: async () => {
			const res = await fetch("/api/tags");
			await on401(res, "GET /api/tags");
			if (!res.ok) throw new Error(`GET /api/tags answered ${res.status}`);
			return tagsAnswer.parse(await res.json()).tags;
		},
		enabled: userId !== null,
		// "Retry" on the page is the person's way to try again, as for looks.
		retry: false,
	});
}

// The account has a tag of this name already, in some letter case.
export class TagNameTaken extends Error {}

async function refused(res: Response, what: string): Promise<never> {
	const body = errorAnswer.safeParse(await res.json().catch(() => null));
	if (res.status === 400 && body.success && body.data.error === "duplicate")
		throw new TagNameTaken();
	throw new Error(`${what} answered ${res.status}`);
}

export function useAddTag() {
	const userId = useUserId();
	const queryClient = useQueryClient();
	const on401 = useSignOutOn401();
	return useMutation({
		mutationFn: async (name: string) => {
			const res = await fetch("/api/tags", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ name }),
			});
			await on401(res, "POST /api/tags");
			if (!res.ok) return refused(res, "POST /api/tags");
			return tagAnswer.parse(await res.json()).tag;
		},
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
