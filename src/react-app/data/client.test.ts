import { afterEach, expect, test } from "bun:test";
import {
	goneAsDone,
	keys,
	queryClient,
	RequestError,
	request,
	SignedOut,
	signedOut,
} from "./client";
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

test("keeps no data of the account after sign-out", async () => {
	// Given: Ann's session, looks, tags, AI apps, and one mutation are cached
	queryClient.setQueryData(keys.me, {
		id: "u1",
		name: "Ann",
		email: "ann@example.com",
		image: null,
	});
	queryClient.setQueryData(keys.looks("u1"), []);
	queryClient.setQueryData(keys.tags("u1"), [
		{ id: "6f1c2b9e-1d2a-4c3b-9e8f-0a1b2c3d4e5f", name: "Work" },
	]);
	queryClient.setQueryData(keys.aiApps("u1"), []);
	queryClient.getMutationCache().build(queryClient, {
		mutationFn: async () => {},
	});
	// When
	await signedOut();
	// Then
	expect({
		queries: queryClient
			.getQueryCache()
			.getAll()
			.map((q) => [q.queryKey, q.state.data]),
		mutations: queryClient.getMutationCache().getAll().length,
	}).toEqual({ queries: [[["me"], null]], mutations: 0 });
});

test("takes a delete answered not found as done", () => {
	// Given
	const notFound = new RequestError(404, "not_found", "DELETE /api/colours/x");
	const failed = new RequestError(500, null, "DELETE /api/colours/x");
	const outcome = (error: unknown) => {
		try {
			goneAsDone(error);
			return "done";
		} catch {
			return "thrown";
		}
	};
	// When
	const seen = { notFound: outcome(notFound), failed: outcome(failed) };
	// Then
	expect(seen).toEqual({ notFound: "done", failed: "thrown" });
});
