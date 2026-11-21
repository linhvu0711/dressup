import { describe, expect, test } from "bun:test";
import {
	BOB,
	colourIds,
	type Harness,
	send,
	withAccount,
} from "./test/harness";

type Tag = { id: string; name: string; combinations: number };

const addTag = (h: Harness, headers: Headers, name: string) =>
	send(h, headers, "POST", "/api/tags", { name });

// The id the server made for the tag.
const added = async (h: Harness, headers: Headers, name: string) =>
	((await (await addTag(h, headers, name)).json()) as { tag: Tag }).tag.id;

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
		const { h, headers } = await withAccount();
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
		const { h, headers } = await withAccount();
		await addTag(h, headers, "Work");
		await addTag(h, headers, "Trip");
		// When
		const names = await namesOf(h, headers);
		// Then
		expect(names).toEqual(["Work", "Trip"]);
	});

	test("refuses a name the account has in another letter case", async () => {
		// Given: alice signed in; "Work" posted
		const { h, headers } = await withAccount();
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

	test("lists only the account's own tags", async () => {
		// Given: alice posted "Work"; bob signed in
		const { h, headers } = await withAccount();
		await addTag(h, headers, "Work");
		const bob = await h.addAccount(BOB);
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
		const { h } = await withAccount();
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

describe("PUT and DELETE /api/tags/:id", () => {
	const rename = (h: Harness, headers: Headers, id: string, name: string) =>
		send(h, headers, "PUT", `/api/tags/${id}`, { id, name });

	const remove = (h: Harness, headers: Headers, id: string) =>
		send(h, headers, "DELETE", `/api/tags/${id}`);

	test("renames a tag", async () => {
		// Given: alice posted "Work"
		const { h, headers } = await withAccount();
		const work = await added(h, headers, "Work");
		// When
		const res = await rename(h, headers, work, "Office");
		// Then
		expect({
			status: res.status,
			body: await res.json(),
			names: await namesOf(h, headers),
		}).toEqual({
			status: 200,
			body: { tag: { id: work, name: "Office" } },
			names: ["Office"],
		});
	});

	test("refuses a rename to another tag's name", async () => {
		// Given: alice posted "Work" and "Trip"
		const { h, headers } = await withAccount();
		await added(h, headers, "Work");
		const trip = await added(h, headers, "Trip");
		// When
		const res = await rename(h, headers, trip, "work");
		// Then
		expect({
			status: res.status,
			body: await res.json(),
			names: await namesOf(h, headers),
		}).toEqual({
			status: 400,
			body: { error: "duplicate", field: "name" },
			names: ["Work", "Trip"],
		});
	});

	test("deletes a tag", async () => {
		// Given: alice posted "Work"
		const { h, headers } = await withAccount();
		const work = await added(h, headers, "Work");
		// When
		const res = await remove(h, headers, work);
		// Then
		expect({ status: res.status, tags: await tagsOf(h, headers) }).toEqual({
			status: 204,
			tags: [],
		});
	});

	test("refuses PUT and DELETE /api/tags/:id without a session", async () => {
		// Given: alice posted "Work"; no session headers
		const { h, headers } = await withAccount();
		const work = await added(h, headers, "Work");
		// When
		const put = await rename(h, new Headers(), work, "Office");
		const del = await remove(h, new Headers(), work);
		// Then
		expect([
			{ status: put.status, body: await put.json() },
			{ status: del.status, body: await del.json() },
		]).toEqual([
			{ status: 401, body: { error: "unauthorized" } },
			{ status: 401, body: { error: "unauthorized" } },
		]);
	});

	test("answers 404 for a delete of another account's tag", async () => {
		// Given: alice posted "Work"; bob signed in
		const { h, headers } = await withAccount();
		const work = await added(h, headers, "Work");
		const bob = await h.addAccount(BOB);
		// When
		const res = await remove(h, bob, work);
		// Then
		expect({
			status: res.status,
			body: await res.json(),
			aliceNames: await namesOf(h, headers),
		}).toEqual({
			status: 404,
			body: { error: "not_found" },
			aliceNames: ["Work"],
		});
	});
});

describe("tags and combinations", () => {
	// The account's colour ids by name, from its first list.
	// Khaki Harrington jacket + Black long tee + Navy casual pants.
	const three = (ids: Record<string, string>, tags: string[]) => ({
		id: "11111111-1111-4111-8111-111111111111",
		pieces: [
			{ typeId: "harrington", colourId: ids.Khaki },
			{ typeId: "tee_l", colourId: ids.Black },
			{ typeId: "casual_p", colourId: ids.Navy },
		],
		tags,
	});

	// White short tee + Grey training shorts.
	const two = (ids: Record<string, string>, tags: string[]) => ({
		id: "22222222-2222-4222-8222-222222222222",
		pieces: [
			{ typeId: "train_sh", colourId: ids.Grey },
			{ typeId: "tee_s", colourId: ids.White },
		],
		tags,
	});

	test("counts the combinations of each tag", async () => {
		// Given: alice; tags Work, Weekend, Rain; THREE with Work and Weekend,
		// TWO with Work
		const { h, headers } = await withAccount();
		const ids = await colourIds(h, headers);
		const work = await added(h, headers, "Work");
		const weekend = await added(h, headers, "Weekend");
		const rain = await added(h, headers, "Rain");
		await send(
			h,
			headers,
			"POST",
			"/api/combinations",
			three(ids, [work, weekend]),
		);
		await send(h, headers, "POST", "/api/combinations", two(ids, [work]));
		// When
		const tags = await tagsOf(h, headers);
		// Then
		expect(tags).toEqual([
			{ id: work, name: "Work", combinations: 2 },
			{ id: weekend, name: "Weekend", combinations: 1 },
			{ id: rain, name: "Rain", combinations: 0 },
		]);
	});
});
