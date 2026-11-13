import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

const meSchema = z.object({
	id: z.string(),
	name: z.string(),
	email: z.string(),
	image: z.string().nullable(),
});

export type Me = z.infer<typeof meSchema>;

export const meQueryKey = ["me"] as const;

async function fetchMe(): Promise<Me | null> {
	const res = await fetch("/api/me");
	if (res.status === 401) return null;
	if (!res.ok) throw new Error(`GET /api/me answered ${res.status}`);
	return meSchema.parse(await res.json());
}

export function useMe() {
	return useQuery({ queryKey: meQueryKey, queryFn: fetchMe, retry: false });
}
