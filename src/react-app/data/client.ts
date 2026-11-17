import { QueryClient } from "@tanstack/react-query";
import type { z } from "zod";
import { type ErrorCode, errorAnswer, meAnswer } from "./contract";

// Every request the web app sends to the worker goes through request(), so
// the 401 rule, the error codes, and the contract check live here once.

export const queryClient = new QueryClient();

export const keys = {
	me: ["me"] as const,
	looks: (userId: string | null) => ["looks", userId] as const,
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
