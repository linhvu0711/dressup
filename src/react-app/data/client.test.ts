import { afterEach, expect, test } from "bun:test";
import { QueryObserver } from "@tanstack/react-query";
import {
	after,
	keys,
	queryClient,
	type RequestError,
	remove,
	request,
	SignedOut,
	signedOut,
} from "./client";
import { ownedItemsAnswer, pictureAnswer, tagsAnswer } from "./contract";

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
	const error = await request("GET", "/api/tags", {
		answer: tagsAnswer,
	}).catch((e: unknown) => e);
	// Then
	expect(error).toBeInstanceOf(SignedOut);
	expect((error as SignedOut).message).toBe("GET /api/tags answered 401");
});

test("keeps no data of the account after sign-out", async () => {
	// Given: Ann's session, tags, AI apps, and one mutation are cached
	queryClient.setQueryData(keys.me, {
		id: "u1",
		name: "Ann",
		email: "ann@example.com",
		image: null,
	});
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

test("answers a delete deleted, gone, or refused", async () => {
	// Given
	globalThis.fetch = (async (input: RequestInfo | URL) => {
		const path = String(input);
		if (path === "/api/tags/a") return new Response(null, { status: 204 });
		if (path === "/api/tags/b")
			return new Response(JSON.stringify({ error: "not_found" }), {
				status: 404,
			});
		return new Response(null, { status: 500 });
	}) as unknown as typeof globalThis.fetch;
	// When
	const a = await remove("/api/tags/a");
	const b = await remove("/api/tags/b");
	const c = await remove("/api/tags/c").catch(
		(e: unknown) => (e as RequestError).status,
	);
	// Then
	expect({ a, b, c }).toEqual({ a: "deleted", b: "gone", c: 500 });
});

test("sends a Blob body with its own type", async () => {
	// Given: the server answers the upload with its id
	const seen: { type: string | null; bytes: number }[] = [];
	globalThis.fetch = (async (_path: string, init: RequestInit) => {
		seen.push({
			type: new Headers(init.headers).get("content-type"),
			bytes: (init.body as Blob).size,
		});
		return new Response(
			JSON.stringify({
				picture: { id: "5b1f2c3d-0000-4000-8000-000000000000" },
			}),
			{ status: 201 },
		);
	}) as unknown as typeof globalThis.fetch;
	const blob = new Blob([new Uint8Array([255, 216, 255])], {
		type: "image/jpeg",
	});
	// When
	const answered = await request("POST", "/api/pictures", {
		body: blob,
		answer: pictureAnswer,
	});
	// Then
	expect({ seen, answered: answered as unknown }).toEqual({
		seen: [{ type: "image/jpeg", bytes: 3 }],
		answered: { picture: { id: "5b1f2c3d-0000-4000-8000-000000000000" } },
	});
});

test("keeps a bought item in the closet when a closet load was under way", async () => {
	// Given: the closet is on screen with no data yet, and its first load,
	// still under way, read the server before the other tab's Bought
	const ITEM = {
		id: "00000000-0000-4000-8000-000000000001",
		typeId: "tee_s",
		colour: {
			id: "00000000-0000-4000-8000-0000000000a1",
			name: "White",
			hex: "#F4F2EE",
		},
		brand: null,
		quantity: 1,
		name: null,
		price: null,
		pictureIds: [],
	};
	let release = () => {};
	let loads = 0;
	globalThis.fetch = (async () => {
		loads += 1;
		if (loads === 1)
			await new Promise<void>((resolve) => {
				release = resolve;
			});
		return new Response(
			JSON.stringify({ ownedItems: loads === 1 ? [] : [ITEM] }),
		);
	}) as unknown as typeof globalThis.fetch;
	const observer = new QueryObserver(queryClient, {
		queryKey: keys.closet(null),
		queryFn: async () =>
			(await request("GET", "/api/owned-items", { answer: ownedItemsAnswer }))
				.ownedItems,
	});
	const stop = observer.subscribe(() => {});
	// When
	const gone = after.shopLinkGone(null, "link-1");
	release();
	await gone;
	// Then
	const closet = queryClient.getQueryData<{ id: string }[]>(keys.closet(null));
	stop();
	expect(closet?.map((i) => i.id)).toEqual([
		"00000000-0000-4000-8000-000000000001",
	]);
});

test("drops a wish when its last shop link is deleted", () => {
	// Given: wish-a with link-1, wish-b with link-2 and link-3, wish-c with no
	// link
	const wish = (id: string, links: string[]) => ({
		id,
		shopLinks: links.map((l) => ({ id: l })),
	});
	queryClient.setQueryData(keys.wishlist(null), [
		wish("wish-a", ["link-1"]),
		wish("wish-b", ["link-2", "link-3"]),
		wish("wish-c", []),
	]);
	// When
	after.shopLinkDeleted(null, "link-1");
	after.shopLinkDeleted(null, "link-2");
	// Then
	const cache = queryClient.getQueryData<
		{ id: string; shopLinks: { id: string }[] }[]
	>(keys.wishlist(null));
	expect(
		cache?.map((w) => ({ id: w.id, links: w.shopLinks.map((l) => l.id) })),
	).toEqual([
		{ id: "wish-b", links: ["link-3"] },
		{ id: "wish-c", links: [] },
	]);
});
