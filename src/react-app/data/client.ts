import { QueryClient } from "@tanstack/react-query";
import type { z } from "zod";
import type { AiApp } from "@/ai-apps/ai-app";
import type { Look, LookId } from "@/looks/look";
import type { Tag, TagId } from "@/tags/tag";
import { type ErrorCode, errorAnswer, meAnswer } from "./contract";

// Every request the web app sends to the worker goes through request(), so
// the 401 rule, the error codes, and the contract check live here once.

export const queryClient = new QueryClient();

export const keys = {
	me: ["me"] as const,
	looks: (userId: string | null) => ["looks", userId] as const,
	tags: (userId: string | null) => ["tags", userId] as const,
	aiApps: (userId: string | null) => ["ai-apps", userId] as const,
	addTag: ["tags", "add"] as const,
	allowApp: (clientId: string) => ["allow-app", clientId] as const,
};

const refresh = (queryKey: readonly unknown[]) => {
	// Not returned: a returned promise holds the caller's callbacks, such as
	// the save form's close, until the list has loaded again.
	void queryClient.invalidateQueries({ queryKey });
};

// What each change does to the cache. Each rule takes the account the hook
// read, so a change that ends after an account switch writes nothing of it
// into the other account's lists.
export const after = {
	// The wall shows a cached list at once while it asks the server again, so
	// the saved look goes into that list now, or a first visit's empty list
	// would show "No looks yet" after a save. A look saved again keeps its
	// place, as the server keeps its time.
	lookSaved(userId: string | null, look: Look) {
		queryClient.setQueryData<Look[]>(
			keys.looks(userId),
			(old) =>
				old &&
				(old.some((l) => l.id === look.id)
					? old.map((l) => (l.id === look.id ? look : l))
					: [look, ...old]),
		);
		refresh(keys.looks(userId));
	},
	// The changed look keeps its place, as the server keeps its time.
	lookChanged(userId: string | null, look: Look) {
		queryClient.setQueryData<Look[]>(keys.looks(userId), (old) =>
			old?.map((l) => (l.id === look.id ? look : l)),
		);
		refresh(keys.looks(userId));
	},
	lookGone(userId: string | null, id: LookId) {
		queryClient.setQueryData<Look[]>(keys.looks(userId), (old) =>
			old?.filter((l) => l.id !== id),
		);
		refresh(keys.looks(userId));
	},
	tagAdded(userId: string | null, tag: Tag) {
		queryClient.setQueryData<Tag[]>(keys.tags(userId), (old) =>
			old ? [...old, tag] : old,
		);
	},
	// The renamed tag keeps its place, as the server keeps its time.
	tagRenamed(userId: string | null, tag: Tag) {
		queryClient.setQueryData<Tag[]>(keys.tags(userId), (old) =>
			old?.map((t) => (t.id === tag.id ? tag : t)),
		);
	},
	// The server's tags may differ from the cached ones, as after an add
	// whose answer was lost, or a rename refused for a change made elsewhere.
	tagsMayDiffer(userId: string | null) {
		refresh(keys.tags(userId));
	},
	// Until the looks load again, the look view and the chips skip a tag the
	// list no longer holds.
	tagDeleted(userId: string | null, id: TagId) {
		queryClient.setQueryData<Tag[]>(keys.tags(userId), (old) =>
			old?.filter((t) => t.id !== id),
		);
		refresh(keys.tags(userId));
		refresh(keys.looks(userId));
	},
	aiAppGone(userId: string | null, id: string) {
		queryClient.setQueryData<AiApp[]>(keys.aiApps(userId), (old) =>
			old?.filter((app) => app.id !== id),
		);
		refresh(keys.aiApps(userId));
	},
};

// A refused request, with the code its answer names, or null when it names
// none.
export class RequestError extends Error {
	constructor(
		readonly status: number,
		readonly code: ErrorCode | null,
		what: string,
	) {
		super(`${what} answered ${status}`);
	}
}

// The session is gone; the 401 rule has run.
export class SignedOut extends Error {}

type Method = "GET" | "POST" | "PUT" | "DELETE";

export function request<S extends z.ZodType>(
	method: Method,
	path: string,
	options: { body?: unknown; answer: S },
): Promise<z.output<S>>;
export function request(
	method: Method,
	path: string,
	options?: { body?: unknown },
): Promise<void>;
export async function request(
	method: Method,
	path: string,
	options: { body?: unknown; answer?: z.ZodType } = {},
): Promise<unknown> {
	const what = `${method} ${path}`;
	const res = await fetch(
		path,
		options.body === undefined
			? { method }
			: {
					method,
					headers: { "content-type": "application/json" },
					body: JSON.stringify(options.body),
				},
	);
	if (res.status === 401) {
		// A lost session makes the session check run again; it finds none,
		// and the session gate shows the sign-in screen.
		void queryClient.invalidateQueries({ queryKey: keys.me });
		throw new SignedOut(`${what} answered 401`);
	}
	if (!res.ok) {
		const body = errorAnswer.safeParse(await res.json().catch(() => null));
		throw new RequestError(
			res.status,
			body.success ? body.data.error : null,
			what,
		);
	}
	if (!options.answer) return;
	const answer = options.answer.safeParse(await res.json());
	if (!answer.success)
		throw new Error(`${what}: the answer does not match the contract`);
	return answer.data;
}

export type Me = z.output<typeof meAnswer>;

// The session check. Its 401 means "no session", so it answers null and
// never runs the 401 rule, which would make this same check run again.
export async function fetchMe(): Promise<Me | null> {
	const res = await fetch("/api/me");
	if (res.status === 401) return null;
	if (!res.ok) throw new Error(`GET /api/me answered ${res.status}`);
	return meAnswer.parse(await res.json());
}
