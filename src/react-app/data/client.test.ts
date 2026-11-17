import { afterEach, expect, test } from "bun:test";
import { keys, queryClient, request, SignedOut } from "./client";
import { looksAnswer } from "./contract";

afterEach(() => queryClient.clear());

test("rejects a request that answers 401 as signed out", async () => {
	// Given: every request answers 401; a session check that found Ann
	globalThis.fetch = (async () =>
		new Response(JSON.stringify({ error: "unauthorized" }), {
			status: 401,
		})) as unknown as typeof globalThis.fetch;
	queryClient.setQueryData(keys.me, {
		id: "u1",
		name: "Ann",
		email: "ann@example.com",
		image: null,
	});
	// When
	const error = await request("GET", "/api/looks", {
		answer: looksAnswer,
	}).catch((e: unknown) => e);
	// Then
	expect(error).toBeInstanceOf(SignedOut);
	expect((error as SignedOut).message).toBe("GET /api/looks answered 401");
});
