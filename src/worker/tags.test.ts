import { describe, expect, test } from "bun:test";
import { makeHarness } from "./test/harness";

type Harness = Awaited<ReturnType<typeof makeHarness>>;

async function withUser(id: string, email: string, name: string) {
	const h = await makeHarness();
	await h.helpers.saveUser(h.helpers.createUser({ id, email, name }));
	return h;
}

const withAlice = () => withUser("alice-id", "alice@example.com", "Alice");

async function aliceSignedIn() {
	const h = await withAlice();
	const headers = await h.helpers.getAuthHeaders({ userId: "alice-id" });
	return { h, headers };
}

async function withBob(h: Harness) {
	await h.helpers.saveUser(
		h.helpers.createUser({
			id: "bob-id",
			email: "bob@example.com",
			name: "Bob",
		}),
	);
	return h.helpers.getAuthHeaders({ userId: "bob-id" });
}

type Tag = { id: string; name: string };

const send = (
	{ app, env }: Harness,
	headers: Headers,
	method: string,
	path: string,
	body?: unknown,
) =>
	app.request(
		path,
		{
			method,
			headers: {
				...Object.fromEntries(headers),
				...(body === undefined ? {} : { "content-type": "application/json" }),
			},
			body: body === undefined ? undefined : JSON.stringify(body),
		},
		env,
	);

const addTag = (h: Harness, headers: Headers, name: string) =>
	send(h, headers, "POST", "/api/tags", { name });

const tagsOf = async (h: Harness, headers: Headers) =>
	(
		(await (await send(h, headers, "GET", "/api/tags")).json()) as {
			tags: Tag[];
		}
	).tags;

const namesOf = async (h: Harness, headers: Headers) =>
	(await tagsOf(h, headers)).map((t) => t.name);

const UUID =
	/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("GET and POST /api/tags", () => {
	test("adds a tag and lists it", async () => {
		// Given: alice signed in
		const { h, headers } = await aliceSignedIn();
		// When
		const res = await addTag(h, headers, "Work");
		const tags = await tagsOf(h, headers);
		// Then
		expect({
			post: res.status,
			tags: tags.map((t) => t.name),
			uuid: UUID.test(tags[0]?.id ?? ""),
		}).toEqual({ post: 201, tags: ["Work"], uuid: true });
	});

	test("lists the tags in the order they were made", async () => {
		// Given: alice signed in; "Work" posted, then "Trip"
		const { h, headers } = await aliceSignedIn();
		await addTag(h, headers, "Work");
		await addTag(h, headers, "Trip");
		// When
		const names = await namesOf(h, headers);
		// Then
		expect(names).toEqual(["Work", "Trip"]);
	});

	test("adds a tag once when the same add comes twice", async () => {
		// Given: alice signed in
		const { h, headers } = await aliceSignedIn();
		// When
		const first = await addTag(h, headers, "Work");
		const second = await addTag(h, headers, "Work");
		// Then
		expect({
			first: first.status,
			second: second.status,
			body: await second.json(),
			count: (await tagsOf(h, headers)).length,
		}).toEqual({
			first: 201,
			second: 400,
			body: { error: "duplicate", field: "name" },
			count: 1,
		});
	});

	test("refuses an empty name", async () => {
		// Given: alice signed in
		const { h, headers } = await aliceSignedIn();
		// When
		const res = await addTag(h, headers, "   ");
		// Then
		expect({ status: res.status, body: await res.json() }).toEqual({
			status: 400,
			body: { error: "invalid", field: "name" },
		});
	});

	test("takes a name of 24 characters", async () => {
		// Given: alice signed in
		const { h, headers } = await aliceSignedIn();
		// When
		const res = await addTag(h, headers, "a".repeat(24));
		// Then
		expect({
			status: res.status,
			name: ((await res.json()) as { tag: Tag }).tag.name,
		}).toEqual({ status: 201, name: "aaaaaaaaaaaaaaaaaaaaaaaa" });
	});

	test("refuses a name of 25 characters", async () => {
		// Given: alice signed in
		const { h, headers } = await aliceSignedIn();
		// When
		const res = await addTag(h, headers, "a".repeat(25));
		// Then
		expect({ status: res.status, body: await res.json() }).toEqual({
			status: 400,
			body: { error: "invalid", field: "name" },
		});
	});

	test("refuses a name the account has in another letter case", async () => {
		// Given: alice signed in; "Work" posted
		const { h, headers } = await aliceSignedIn();
		await addTag(h, headers, "Work");
		// When
		const res = await addTag(h, headers, "wORK");
		// Then
		expect({
			status: res.status,
			body: await res.json(),
			count: (await tagsOf(h, headers)).length,
		}).toEqual({
			status: 400,
			body: { error: "duplicate", field: "name" },
			count: 1,
		});
	});

	test("takes a name another account has", async () => {
		// Given: alice posted "Work"; bob signed in
		const { h, headers } = await aliceSignedIn();
		await addTag(h, headers, "Work");
		const bob = await withBob(h);
		// When
		const res = await addTag(h, bob, "work");
		// Then
		expect(res.status).toBe(201);
	});

	test("lists only the account's own tags", async () => {
		// Given: alice posted "Work"; bob signed in
		const { h, headers } = await aliceSignedIn();
		await addTag(h, headers, "Work");
		const bob = await withBob(h);
		// When
		const res = await send(h, bob, "GET", "/api/tags");
		// Then
		expect({ status: res.status, body: await res.json() }).toEqual({
			status: 200,
			body: { tags: [] },
		});
	});

	test("refuses GET and POST /api/tags without a session", async () => {
		// Given: alice, no session headers
		const h = await withAlice();
		// When
		const list = await send(h, new Headers(), "GET", "/api/tags");
		const add = await addTag(h, new Headers(), "Work");
		// Then
		expect([
			{ status: list.status, body: await list.json() },
			{ status: add.status, body: await add.json() },
		]).toEqual([
			{ status: 401, body: { error: "unauthorized" } },
			{ status: 401, body: { error: "unauthorized" } },
		]);
	});
});
