import { describe, expect, setSystemTime, test } from "bun:test";
import { schema } from "./db";
import {
	type aiSession,
	BOB,
	bytes,
	type Harness,
	postBrands,
	send,
	uploadPicture,
	withAiSession,
} from "./test/harness";

type Session = Awaited<ReturnType<typeof aiSession>>;

const addTag = async (h: Harness, ai: Session, name: string) => {
	const res = await send(h, ai.jar, "POST", "/api/tags", { name });
	expect(res.status).toBe(201);
	return ((await res.json()) as { tag: { id: string } }).tag.id;
};

// A second account, bob, and a way to send as him.
async function asBob(h: Harness) {
	const headers = await h.addAccount(BOB);
	return (method: string, path: string, body?: unknown) =>
		send(h, headers, method, path, body);
}

const tags = async (h: Harness, ai: Session) =>
	(
		(await (await send(h, ai.jar, "GET", "/api/tags")).json()) as {
			tags: { id: string; name: string; combinations: number }[];
		}
	).tags;

describe("tags", () => {
	const R = { readOnlyHint: true };
	const W = { readOnlyHint: false, destructiveHint: false };
	const D = { readOnlyHint: false, destructiveHint: true };

	test("lists every AI action with its marks", async () => {
		// Given
		const { ai } = await withAiSession();
		// When
		const listed = await ai.list();
		// Then
		expect(listed.map((t) => [t.name, t.annotations])).toEqual([
			["list_tags", R],
			["add_tag", W],
			["rename_tag", W],
			["delete_tag", D],
			["list_colours", R],
			["add_colour", W],
			["change_colour", W],
			["delete_colour", D],
			["list_brands", R],
			["add_brand", W],
			["rename_brand", W],
			["delete_brand", D],
			["list_types", R],
			["list_combinations", R],
			["save_combination", W],
			["change_combination", W],
			["delete_combination", D],
			["list_owned_items", R],
			["add_owned_item", W],
			["change_owned_item", W],
			["delete_owned_item", D],
			["list_wishes", R],
			["add_wish", W],
			["delete_wish", D],
			["add_shop_link", W],
			["change_shop_link", W],
			["delete_shop_link", D],
			["mark_shop_link_bought", D],
			["get_upload_address", W],
			["show_picture", R],
		]);
		expect(listed.every((t) => typeof t.title === "string")).toBe(true);
	});

	test("lists no tags with its own text", async () => {
		// Given
		const { ai } = await withAiSession();
		// When
		const result = await ai.call("list_tags");
		// Then
		expect(result).toEqual({
			isError: false,
			text: "You have no tags yet.",
			data: { tags: [] },
		});
	});

	test("lists the tags", async () => {
		// Given
		const { h, ai } = await withAiSession();
		const work = await addTag(h, ai, "Work");
		// When
		const { data } = await ai.call("list_tags");
		// Then
		expect(data).toEqual({
			tags: [{ id: work, name: "Work", combinations: 0 }],
		});
	});

	test("adds a tag", async () => {
		// Given
		const { h, ai } = await withAiSession();
		// When
		const { isError, data } = await ai.call("add_tag", { name: "Work" });
		// Then
		const stored = await tags(h, ai);
		expect({
			isError,
			names: stored.map((t) => t.name),
			sameId: stored[0]?.id === (data as { tag: { id: string } }).tag.id,
		}).toEqual({ isError: false, names: ["Work"], sameId: true });
	});

	test("refuses a tag name already used", async () => {
		// Given
		const { h, ai } = await withAiSession();
		await addTag(h, ai, "Work");
		// When
		const { isError, text } = await ai.call("add_tag", { name: "work" });
		// Then
		expect({
			isError,
			text,
			names: (await tags(h, ai)).map((t) => t.name),
		}).toEqual({
			isError: true,
			text: "You already have a tag called work.",
			names: ["Work"],
		});
	});

	test("refuses a tag name of 25 characters", async () => {
		// Given
		const { h, ai } = await withAiSession();
		// When
		const { isError, text } = await ai.call("add_tag", {
			name: "a".repeat(25),
		});
		// Then
		expect({
			isError,
			text,
			names: (await tags(h, ai)).map((t) => t.name),
		}).toEqual({
			isError: true,
			text: "A tag name has 1 to 24 characters.",
			names: [],
		});
	});

	test("renames a tag", async () => {
		// Given
		const { h, ai } = await withAiSession();
		const work = await addTag(h, ai, "Work");
		// When
		const { isError } = await ai.call("rename_tag", {
			id: work,
			name: "Office",
		});
		// Then
		expect({ isError, tags: await tags(h, ai) }).toEqual({
			isError: false,
			tags: [{ id: work, name: "Office", combinations: 0 }],
		});
	});

	test("refuses to rename a tag to a name already used", async () => {
		// Given
		const { h, ai } = await withAiSession();
		await addTag(h, ai, "Work");
		const trip = await addTag(h, ai, "Trip");
		// When
		const { isError, text } = await ai.call("rename_tag", {
			id: trip,
			name: "work",
		});
		// Then
		expect({
			isError,
			text,
			names: (await tags(h, ai)).map((t) => t.name),
		}).toEqual({
			isError: true,
			text: "You already have a tag called work.",
			names: ["Work", "Trip"],
		});
	});

	test("refuses to rename a tag to an empty name", async () => {
		// Given
		const { h, ai } = await withAiSession();
		const work = await addTag(h, ai, "Work");
		// When
		const { isError, text } = await ai.call("rename_tag", {
			id: work,
			name: "  ",
		});
		// Then
		expect({
			isError,
			text,
			names: (await tags(h, ai)).map((t) => t.name),
		}).toEqual({
			isError: true,
			text: "A tag name has 1 to 24 characters.",
			names: ["Work"],
		});
	});

	test("refuses to rename a tag that is gone", async () => {
		// Given
		const { h, ai } = await withAiSession();
		const work = await addTag(h, ai, "Work");
		expect((await send(h, ai.jar, "DELETE", `/api/tags/${work}`)).status).toBe(
			204,
		);
		// When
		const { isError, text } = await ai.call("rename_tag", {
			id: work,
			name: "Office",
		});
		// Then
		expect({ isError, text, tags: await tags(h, ai) }).toEqual({
			isError: true,
			text: "No tag with this id.",
			tags: [],
		});
	});

	test("deletes a tag", async () => {
		// Given
		const { h, ai } = await withAiSession();
		const work = await addTag(h, ai, "Work");
		// When
		const { isError } = await ai.call("delete_tag", { id: work });
		// Then
		expect({ isError, tags: await tags(h, ai) }).toEqual({
			isError: false,
			tags: [],
		});
	});

	test("refuses to delete another account's tag", async () => {
		// Given
		const { h, ai } = await withAiSession();
		const bob = await asBob(h);
		const posted = await bob("POST", "/api/tags", { name: "Work" });
		expect(posted.status).toBe(201);
		const bobWork = ((await posted.json()) as { tag: { id: string } }).tag.id;
		// When
		const { isError, text } = await ai.call("delete_tag", { id: bobWork });
		// Then
		const bobTags = (await (await bob("GET", "/api/tags")).json()) as {
			tags: unknown[];
		};
		expect({ isError, text, bobTags: bobTags.tags.length }).toEqual({
			isError: true,
			text: "No tag with this id.",
			bobTags: 1,
		});
	});
});

type Colour = { id: string; name: string; hex: string; inUse?: boolean };

const colours = async (h: Harness, ai: Session) =>
	(
		(await (await send(h, ai.jar, "GET", "/api/colours")).json()) as {
			colours: Colour[];
		}
	).colours;

describe("colours", () => {
	// The colour the AI app added; its id is the answer's.
	async function withTeal() {
		const { h, ai } = await withAiSession();
		const { data } = await ai.call("add_colour", {
			name: "Teal",
			hex: "#2A7F7F",
		});
		return { h, ai, id: (data as { colour: Colour }).colour.id };
	}

	test("lists the starter colours", async () => {
		// Given
		const { ai } = await withAiSession();
		// When
		const { isError, data } = await ai.call("list_colours");
		// Then
		const listed = (data as { colours: Colour[] }).colours;
		expect({
			isError,
			count: listed.length,
			first: { name: listed[0]?.name, hex: listed[0]?.hex },
		}).toEqual({
			isError: false,
			count: 13,
			first: { name: "White", hex: "#F4F2ED" },
		});
	});

	test("adds a colour", async () => {
		// Given
		const { h, ai } = await withAiSession();
		// When
		const { isError, data } = await ai.call("add_colour", {
			name: "Teal",
			hex: "#2A7F7F",
		});
		// Then
		const last = (await colours(h, ai)).at(-1);
		expect({
			isError,
			last: last?.name,
			sameId: last?.id === (data as { colour: Colour }).colour.id,
		}).toEqual({ isError: false, last: "Teal", sameId: true });
	});

	test("refuses a colour name already used", async () => {
		// Given
		const { h, ai } = await withAiSession();
		// When
		const { isError, text } = await ai.call("add_colour", {
			name: "navy",
			hex: "#2A7F7F",
		});
		// Then
		expect({ isError, text, count: (await colours(h, ai)).length }).toEqual({
			isError: true,
			text: "You already have a colour called navy.",
			count: 13,
		});
	});

	test("changes a colour", async () => {
		// Given
		const { h, ai, id } = await withTeal();
		// When
		const { isError } = await ai.call("change_colour", {
			id,
			name: "Sea",
			hex: "#2A6F7F",
		});
		// Then
		expect({ isError, stored: (await colours(h, ai)).at(-1) }).toEqual({
			isError: false,
			stored: { id, name: "Sea", hex: "#2A6F7F", inUse: false },
		});
	});

	test("refuses to change a colour to a name another colour has", async () => {
		// Given
		const { ai, id } = await withTeal();
		// When
		const { isError, text } = await ai.call("change_colour", {
			id,
			name: "navy",
			hex: "#2A7F7F",
		});
		// Then
		expect({ isError, text }).toEqual({
			isError: true,
			text: "You already have a colour called navy.",
		});
	});

	test("deletes a colour", async () => {
		// Given
		const { h, ai, id } = await withTeal();
		// When
		const { isError } = await ai.call("delete_colour", { id });
		// Then
		const names = (await colours(h, ai)).map((c) => c.name);
		expect({
			isError,
			count: names.length,
			teal: names.includes("Teal"),
		}).toEqual({ isError: false, count: 13, teal: false });
	});

	test("refuses to delete a colour a combination uses", async () => {
		// Given: the account saved Navy casual pants and a White long tee
		const { h, ai } = await withAiSession();
		const listed = await colours(h, ai);
		const idOf = (name: string) =>
			listed.find((c) => c.name === name)?.id ?? "";
		await send(h, ai.jar, "POST", "/api/combinations", {
			id: "11111111-1111-4111-8111-111111111111",
			pieces: [
				{ typeId: "casual_p", colourId: idOf("Navy") },
				{ typeId: "tee_l", colourId: idOf("White") },
			],
		});
		// When
		const { isError, text } = await ai.call("delete_colour", {
			id: idOf("Navy"),
		});
		// Then
		expect({ isError, text }).toEqual({
			isError: true,
			text: "A combination, an owned item, or a wish uses Navy, so it stays. A colour in use cannot be deleted.",
		});
	});
});

type Brand = { id: string; name: string };

const brandNames = async (ai: Session) =>
	((await ai.call("list_brands")).data as { brands: Brand[] }).brands.map(
		(b) => b.name,
	);

describe("brands", () => {
	// The brand the AI app added; its id is the answer's.
	async function withZara() {
		const { h, ai } = await withAiSession();
		const { data } = await ai.call("add_brand", { name: "Zara" });
		return { h, ai, id: (data as { brand: Brand }).brand.id };
	}

	test("lists no brands for a new account", async () => {
		// Given
		const { ai } = await withAiSession();
		// When
		const result = await ai.call("list_brands");
		// Then
		expect(result).toEqual({
			isError: false,
			text: "You have no brands yet.",
			data: { brands: [] },
		});
	});

	test("adds a brand and lists it", async () => {
		// Given
		const { ai } = await withAiSession();
		// When
		const { isError } = await ai.call("add_brand", { name: "Uniqlo" });
		// Then
		expect({ isError, names: await brandNames(ai) }).toEqual({
			isError: false,
			names: ["Uniqlo"],
		});
	});

	test("refuses a brand name already used", async () => {
		// Given
		const { ai } = await withZara();
		// When
		const { isError, text } = await ai.call("add_brand", { name: "zara" });
		// Then
		expect({ isError, text }).toEqual({
			isError: true,
			text: "You already have a brand called zara.",
		});
	});

	test("refuses an empty brand name", async () => {
		// Given
		const { ai } = await withAiSession();
		// When
		const { isError, text } = await ai.call("add_brand", { name: " " });
		// Then
		expect({ isError, text }).toEqual({
			isError: true,
			text: "A brand name has 1 to 24 characters.",
		});
	});

	test("refuses brand number 101", async () => {
		// Given: 100 brands, added through the routes
		const { h, ai } = await withAiSession();
		await postBrands(h, ai.jar, 100);
		// When
		const { isError, text } = await ai.call("add_brand", { name: "Uniqlo" });
		// Then
		expect({ isError, text }).toEqual({
			isError: true,
			text: "You have 100 brands. That is the limit. Delete one to add a new one.",
		});
	});

	test("renames a brand", async () => {
		// Given
		const { ai, id } = await withZara();
		// When
		const { isError, data } = await ai.call("rename_brand", {
			id,
			name: "Zara Home",
		});
		// Then
		expect({ isError, data }).toEqual({
			isError: false,
			data: { brand: { id, name: "Zara Home" } },
		});
	});

	test("deletes a brand", async () => {
		// Given
		const { ai, id } = await withZara();
		// When
		const { data } = await ai.call("delete_brand", { id });
		// Then
		expect({
			deleted: (data as { deleted: string }).deleted,
			names: await brandNames(ai),
		}).toEqual({ deleted: id, names: [] });
	});

	test("refuses to delete a brand that is gone", async () => {
		// Given
		const { ai } = await withAiSession();
		// When
		const { isError, text } = await ai.call("delete_brand", {
			id: "6f1c2b9e-1d2a-4c3b-9e8f-0a1b2c3d4e5f",
		});
		// Then
		expect({ isError, text }).toEqual({
			isError: true,
			text: "No brand with this id.",
		});
	});
});

describe("AI action limit", () => {
	// Starts a clock minute so the 61 calls cannot cross into the next one.
	async function sixtyActions() {
		const { h, ai } = await withAiSession();
		const start = Math.ceil(Date.now() / 60_000) * 60_000 + 1000;
		setSystemTime(start);
		for (let i = 0; i < 60; i++)
			expect((await ai.call("list_tags")).isError).toBe(false);
		return { h, ai, start };
	}

	test("refuses the 61st AI action in one minute", async () => {
		// Given
		const { ai } = await sixtyActions();
		// When
		const { isError, text } = await ai.call("list_tags");
		// Then
		expect({ isError, text }).toEqual({
			isError: true,
			text: "Too many actions. Wait a minute and try again.",
		});
	});

	test("takes AI actions again in the next minute", async () => {
		// Given
		const { ai, start } = await sixtyActions();
		expect((await ai.call("list_tags")).isError).toBe(true);
		setSystemTime(start + 60_000);
		// When
		const { isError, text } = await ai.call("list_tags");
		// Then
		expect({ isError, text }).toEqual({
			isError: false,
			text: "You have no tags yet.",
		});
	});

	test("counts a late call from the minute before in the new minute", async () => {
		// Given: 60 actions in this minute, then a call that read the clock in
		// the minute before lands late
		const { ai, start } = await sixtyActions();
		setSystemTime(start - 60_000);
		// When
		const { isError, text } = await ai.call("list_tags");
		// Then
		expect({ isError, text }).toEqual({
			isError: true,
			text: "Too many actions. Wait a minute and try again.",
		});
	});

	test("refuses add_colour as the 61st AI action", async () => {
		// Given
		const { h, ai } = await sixtyActions();
		// When
		const { isError, text } = await ai.call("add_colour", {
			name: "Teal",
			hex: "#2A7F7F",
		});
		// Then
		expect({ isError, text, rows: await h.rows(schema.colour) }).toEqual({
			isError: true,
			text: "Too many actions. Wait a minute and try again.",
			rows: [],
		});
	});

	test("leaves the app's own routes without a new limit", async () => {
		// Given
		const { h, ai } = await sixtyActions();
		expect((await ai.call("list_tags")).isError).toBe(true);
		// When
		const statuses: number[] = [];
		for (let i = 0; i < 61; i++)
			statuses.push((await send(h, ai.jar, "GET", "/api/tags")).status);
		// Then
		expect({
			count: statuses.length,
			statuses: [...new Set(statuses)],
		}).toEqual({ count: 61, statuses: [200] });
	});
});

describe("combinations", () => {
	type Listed = { title: string; id: string };

	// The colour ids of the account by name, from list_colours.
	async function colourIds(ai: Session) {
		const { data } = await ai.call("list_colours");
		return Object.fromEntries(
			(data as { colours: Colour[] }).colours.map((c) => [c.name, c.id]),
		);
	}

	// Khaki Harrington jacket + Black long tee + Navy casual pants.
	const three = (ids: Record<string, string>) => ({
		pieces: [
			{ typeId: "harrington", colourId: ids.Khaki },
			{ typeId: "tee_l", colourId: ids.Black },
			{ typeId: "casual_p", colourId: ids.Navy },
		],
	});

	// White short tee + Grey training shorts.
	const two = (ids: Record<string, string>) => ({
		pieces: [
			{ typeId: "train_sh", colourId: ids.Grey },
			{ typeId: "tee_s", colourId: ids.White },
		],
	});

	// The id of a combination save_combination saved.
	const savedId = async (ai: Session, body: Record<string, unknown>) =>
		(
			(await ai.call("save_combination", body)).data as {
				combination: Listed;
			}
		).combination.id;

	// THREE's pieces with Grey casual pants in place of Navy.
	const greyPants = (ids: Record<string, string>) => [
		{ typeId: "harrington", colourId: ids.Khaki },
		{ typeId: "tee_l", colourId: ids.Black },
		{ typeId: "casual_p", colourId: ids.Grey },
	];

	test("changes a combination's pieces", async () => {
		// Given: THREE saved
		const { ai } = await withAiSession();
		const ids = await colourIds(ai);
		const id = await savedId(ai, three(ids));
		// When
		const { isError, data } = await ai.call("change_combination", {
			id,
			pieces: greyPants(ids),
		});
		// Then
		const changed = (data as { combination: Listed }).combination;
		expect({ isError, id: changed.id, title: changed.title }).toEqual({
			isError: false,
			id,
			title: "Khaki Harrington jacket + Black long tee + Grey casual pants",
		});
	});

	test("refuses a change into a combination the account has", async () => {
		// Given: THREE and TWO saved
		const { ai } = await withAiSession();
		const ids = await colourIds(ai);
		const threeId = await savedId(ai, three(ids));
		const twoId = await savedId(ai, two(ids));
		// When
		const { isError, text } = await ai.call("change_combination", {
			id: threeId,
			pieces: two(ids).pieces,
		});
		// Then
		expect({ isError, text }).toEqual({
			isError: true,
			text: `You have this combination already, with id ${twoId}.`,
		});
	});

	test("refuses a change to a combination that is gone", async () => {
		// Given: THREE saved, then deleted
		const { ai } = await withAiSession();
		const ids = await colourIds(ai);
		const id = await savedId(ai, three(ids));
		await ai.call("delete_combination", { id });
		// When
		const { isError, text } = await ai.call("change_combination", {
			id,
			pieces: two(ids).pieces,
		});
		// Then
		expect({ isError, text }).toEqual({
			isError: true,
			text: "No combination with this id.",
		});
	});

	test("deletes a combination", async () => {
		// Given: THREE saved
		const { ai } = await withAiSession();
		const id = await savedId(ai, three(await colourIds(ai)));
		// When
		const { isError } = await ai.call("delete_combination", { id });
		// Then
		const listed = await ai.call("list_combinations");
		expect({ isError, text: listed.text }).toEqual({
			isError: false,
			text: "You have no combinations yet.",
		});
	});

	test("refuses to delete a combination that is gone", async () => {
		// Given: THREE saved and deleted
		const { ai } = await withAiSession();
		const id = await savedId(ai, three(await colourIds(ai)));
		await ai.call("delete_combination", { id });
		// When
		const { isError, text } = await ai.call("delete_combination", { id });
		// Then
		expect({ isError, text }).toEqual({
			isError: true,
			text: "No combination with this id.",
		});
	});

	test("lists the types with their layers", async () => {
		// Given
		const { ai } = await withAiSession();
		// When
		const { data } = await ai.call("list_types");
		// Then
		const types = (
			data as { types: { id: string; name: string; layer: string }[] }
		).types;
		const byLayer: Record<string, string[]> = {};
		for (const t of types)
			byLayer[t.layer] = [...(byLayer[t.layer] ?? []), t.id];
		expect({ byLayer, first: types[0] }).toEqual({
			byLayer: {
				inner_top: [
					"tee_s",
					"tee_l",
					"polo_s",
					"polo_l",
					"shirt_s",
					"shirt_l",
					"ttee_s",
					"ttee_l",
				],
				sweater: ["sweater"],
				jacket: ["harrington", "wool"],
				bottom: [
					"chino_sh",
					"chino_p",
					"casual_sh",
					"casual_p",
					"train_sh",
					"train_p",
				],
			},
			first: { id: "tee_s", name: "Short tee", layer: "inner_top" },
		});
	});

	test("lists no combinations with its own text", async () => {
		// Given
		const { ai } = await withAiSession();
		// When
		const { isError, text } = await ai.call("list_combinations");
		// Then
		expect({ isError, text }).toEqual({
			isError: false,
			text: "You have no combinations yet.",
		});
	});

	test("saves a combination and lists it with its title", async () => {
		// Given
		const { ai } = await withAiSession();
		const ids = await colourIds(ai);
		// When
		const saved = await ai.call("save_combination", three(ids));
		const { data } = await ai.call("list_combinations");
		// Then
		const { combinations } = data as { combinations: Listed[] };
		expect({
			isError: saved.isError,
			titles: combinations.map((c) => c.title),
			fields: combinations.map((c) => Object.keys(c).sort()),
		}).toEqual({
			isError: false,
			titles: ["Khaki Harrington jacket + Black long tee + Navy casual pants"],
			fields: [["id", "pieces", "tags", "title"]],
		});
	});

	test("refuses a combination the account has", async () => {
		// Given: the combination saved once
		const { ai } = await withAiSession();
		const ids = await colourIds(ai);
		const first = await ai.call("save_combination", three(ids));
		const id = (first.data as { combination: Listed }).combination.id;
		// When
		const { isError, text } = await ai.call("save_combination", three(ids));
		// Then
		expect({ isError, text }).toEqual({
			isError: true,
			text: `You have this combination already, with id ${id}.`,
		});
	});

	test("refuses a save at 300 combinations", async () => {
		// Given
		const { h, ai, userId } = await withAiSession();
		const ids = await colourIds(ai);
		await h.seedCombinations(userId, 300);
		// When
		const { isError, text } = await ai.call("save_combination", three(ids));
		// Then
		expect({ isError, text }).toEqual({
			isError: true,
			text: "You have 300 combinations. That is the limit.",
		});
	});

	test("refuses one piece", async () => {
		// Given
		const { ai } = await withAiSession();
		const ids = await colourIds(ai);
		// When
		const { isError, text } = await ai.call("save_combination", {
			pieces: [{ typeId: "casual_p", colourId: ids.Navy }],
		});
		// Then
		expect({ isError, text }).toEqual({
			isError: true,
			text: "A combination has 2 to 4 pieces.",
		});
	});

	test("refuses two pieces in one layer", async () => {
		// Given
		const { ai } = await withAiSession();
		const ids = await colourIds(ai);
		// When
		const { isError, text } = await ai.call("save_combination", {
			pieces: [
				{ typeId: "casual_p", colourId: ids.Navy },
				{ typeId: "chino_sh", colourId: ids.Black },
			],
		});
		// Then
		expect({ isError, text }).toEqual({
			isError: true,
			text: "Casual pants and Chino shorts are both in the bottom layer. A combination has at most one piece for each layer.",
		});
	});

	test("refuses a type that is not in the list", async () => {
		// Given
		const { ai } = await withAiSession();
		const ids = await colourIds(ai);
		// When
		const { isError, text } = await ai.call("save_combination", {
			pieces: [
				{ typeId: "jeans", colourId: ids.Navy },
				{ typeId: "tee_l", colourId: ids.Black },
			],
		});
		// Then
		expect({ isError, text }).toEqual({
			isError: true,
			text: "jeans is not a type. list_types names the types.",
		});
	});

	test("refuses a colour that is not the account's", async () => {
		// Given
		const { ai } = await withAiSession();
		const ids = await colourIds(ai);
		// When
		const { isError, text } = await ai.call("save_combination", {
			pieces: [
				{ typeId: "casual_p", colourId: "not-a-colour" },
				{ typeId: "tee_l", colourId: ids.Black },
			],
		});
		// Then
		expect({ isError, text }).toEqual({
			isError: true,
			text: "not-a-colour is not one of your colours. list_colours names them.",
		});
	});

	describe("tags", () => {
		type Named = { id: string; name: string };
		type Tagged = { id: string; tags: Named[] };

		const addTagByAi = async (ai: Session, name: string) =>
			((await ai.call("add_tag", { name })).data as { tag: Named }).tag.id;

		test("saves a combination with tags and lists them with their names", async () => {
			// Given
			const { ai } = await withAiSession();
			const work = await addTagByAi(ai, "Work");
			const weekend = await addTagByAi(ai, "Weekend");
			const ids = await colourIds(ai);
			// When
			const saved = await ai.call("save_combination", {
				...three(ids),
				tags: [work, weekend],
			});
			const { data } = await ai.call("list_combinations");
			// Then
			expect({
				isError: saved.isError,
				tags: (data as { combinations: Tagged[] }).combinations[0].tags,
			}).toEqual({
				isError: false,
				tags: [
					{ id: work, name: "Work" },
					{ id: weekend, name: "Weekend" },
				],
			});
		});

		test("changes a combination's tags", async () => {
			// Given: THREE saved with Work
			const { ai } = await withAiSession();
			const work = await addTagByAi(ai, "Work");
			const weekend = await addTagByAi(ai, "Weekend");
			const ids = await colourIds(ai);
			const id = await savedId(ai, { ...three(ids), tags: [work] });
			// When
			const { isError, data } = await ai.call("change_combination", {
				id,
				pieces: three(ids).pieces,
				tags: [weekend],
			});
			// Then
			expect({
				isError,
				tags: (data as { combination: Tagged }).combination.tags,
			}).toEqual({ isError: false, tags: [{ id: weekend, name: "Weekend" }] });
		});

		test("keeps a combination's tags when a change leaves them out", async () => {
			// Given: THREE saved with Work
			const { ai } = await withAiSession();
			const work = await addTagByAi(ai, "Work");
			const ids = await colourIds(ai);
			const id = await savedId(ai, { ...three(ids), tags: [work] });
			// When
			const { data } = await ai.call("change_combination", {
				id,
				pieces: greyPants(ids),
			});
			// Then
			expect((data as { combination: Tagged }).combination.tags).toEqual([
				{ id: work, name: "Work" },
			]);
		});

		test("refuses a tag that is not the account's as a sentence", async () => {
			// Given
			const { ai } = await withAiSession();
			const ids = await colourIds(ai);
			// When
			const { isError, text } = await ai.call("save_combination", {
				...three(ids),
				tags: ["5b1f2c3d-0000-4000-8000-000000000000"],
			});
			// Then
			expect({ isError, text }).toEqual({
				isError: true,
				text: "5b1f2c3d-0000-4000-8000-000000000000 is not one of your tags. list_tags names them.",
			});
		});

		test("refuses 51 tags as a sentence", async () => {
			// Given: 51 tags
			const { ai } = await withAiSession();
			const ids = await colourIds(ai);
			const many: string[] = [];
			for (let n = 0; n < 51; n++) many.push(await addTagByAi(ai, `t${n}`));
			// When
			const { isError, text } = await ai.call("save_combination", {
				...three(ids),
				tags: many,
			});
			// Then
			expect({ isError, text }).toEqual({
				isError: true,
				text: "A combination has at most 50 tags.",
			});
		});

		test("takes a deleted tag off its combinations", async () => {
			// Given: THREE saved with Work and Weekend
			const { ai } = await withAiSession();
			const work = await addTagByAi(ai, "Work");
			const weekend = await addTagByAi(ai, "Weekend");
			const ids = await colourIds(ai);
			await savedId(ai, { ...three(ids), tags: [work, weekend] });
			// When
			await ai.call("delete_tag", { id: weekend });
			const { data } = await ai.call("list_combinations");
			// Then
			expect((data as { combinations: Tagged[] }).combinations[0].tags).toEqual(
				[{ id: work, name: "Work" }],
			);
		});

		test("lists the combinations that hold every piece row and carry every tag", async () => {
			// Given: TWO, THREE with Work, and White short tee + Navy chino pants
			// with Work, saved in that order
			const { ai } = await withAiSession();
			const work = await addTagByAi(ai, "Work");
			const ids = await colourIds(ai);
			await savedId(ai, two(ids));
			await savedId(ai, { ...three(ids), tags: [work] });
			await savedId(ai, {
				pieces: [
					{ typeId: "chino_p", colourId: ids.Navy },
					{ typeId: "tee_s", colourId: ids.White },
				],
				tags: [work],
			});
			// When
			const { isError, data } = await ai.call("list_combinations", {
				pieces: [
					{ typeId: "tee_s", colourId: ids.White },
					{ colourId: ids.Navy },
				],
				tags: [work],
			});
			// Then
			expect({
				isError,
				titles: (data as { combinations: Listed[] }).combinations.map(
					(c) => c.title,
				),
			}).toEqual({
				isError: false,
				titles: ["White short tee + Navy chino pants"],
			});
		});

		test("refuses a tag in a filter that is not the account's", async () => {
			// Given
			const { ai } = await withAiSession();
			await savedId(ai, three(await colourIds(ai)));
			// When
			const { isError, text } = await ai.call("list_combinations", {
				tags: ["not-a-tag"],
			});
			// Then
			expect({ isError, text }).toEqual({
				isError: true,
				text: "not-a-tag is not one of your tags. list_tags names them.",
			});
		});
	});

	test("lists own and want for each piece", async () => {
		// Given: THREE, the Khaki Harrington jacket owned and wanted, the Black
		// long tee wanted
		const { ai } = await withAiSession();
		const ids = await colourIds(ai);
		await savedId(ai, three(ids));
		await ai.call("add_owned_item", {
			typeId: "harrington",
			colourId: ids.Khaki,
			quantity: 1,
		});
		await ai.call("add_wish", { typeId: "harrington", colourId: ids.Khaki });
		await ai.call("add_wish", { typeId: "tee_l", colourId: ids.Black });
		// When
		const { data } = await ai.call("list_combinations");
		// Then: in layer order, bottom first
		type Marked = { pieces: { typeId: string; own: boolean; want: boolean }[] };
		expect(
			(data as { combinations: Marked[] }).combinations[0].pieces.map(
				({ typeId, own, want }) => ({ typeId, own, want }),
			),
		).toEqual([
			{ typeId: "casual_p", own: false, want: false },
			{ typeId: "tee_l", own: false, want: true },
			{ typeId: "harrington", own: true, want: true },
		]);
	});

	test("lists only the combinations whose pieces the closet has all of with own all", async () => {
		// Given: TWO, then THREE; the closet has both pieces of TWO
		const { ai } = await withAiSession();
		const ids = await colourIds(ai);
		await savedId(ai, two(ids));
		await savedId(ai, three(ids));
		await ai.call("add_owned_item", {
			typeId: "train_sh",
			colourId: ids.Grey,
			quantity: 1,
		});
		await ai.call("add_owned_item", {
			typeId: "tee_s",
			colourId: ids.White,
			quantity: 1,
		});
		// When
		const { isError, data } = await ai.call("list_combinations", {
			own: "all",
		});
		// Then
		expect({
			isError,
			titles: (data as { combinations: Listed[] }).combinations.map(
				(c) => c.title,
			),
		}).toEqual({
			isError: false,
			titles: ["White short tee + Grey training shorts"],
		});
	});

	test("lists the combinations with a piece the closet lacks with own not_all", async () => {
		// Given: TWO, then THREE; the closet has both pieces of TWO
		const { ai } = await withAiSession();
		const ids = await colourIds(ai);
		await savedId(ai, two(ids));
		await savedId(ai, three(ids));
		await ai.call("add_owned_item", {
			typeId: "train_sh",
			colourId: ids.Grey,
			quantity: 1,
		});
		await ai.call("add_owned_item", {
			typeId: "tee_s",
			colourId: ids.White,
			quantity: 1,
		});
		// When
		const { isError, data } = await ai.call("list_combinations", {
			own: "not_all",
		});
		// Then
		expect({
			isError,
			titles: (data as { combinations: Listed[] }).combinations.map(
				(c) => c.title,
			),
		}).toEqual({
			isError: false,
			titles: ["Khaki Harrington jacket + Black long tee + Navy casual pants"],
		});
	});

	test("says no combination matches when own all finds none", async () => {
		// Given: TWO, and nothing in the closet
		const { ai } = await withAiSession();
		await savedId(ai, two(await colourIds(ai)));
		// When
		const { isError, text } = await ai.call("list_combinations", {
			own: "all",
		});
		// Then
		expect({ isError, text }).toEqual({
			isError: false,
			text: "No combination matches these filters.",
		});
	});

	test("refuses a type in a filter that is not a type", async () => {
		// Given
		const { ai } = await withAiSession();
		await savedId(ai, three(await colourIds(ai)));
		// When
		const { isError, text } = await ai.call("list_combinations", {
			pieces: [{ typeId: "jeans" }],
		});
		// Then
		expect({ isError, text }).toEqual({
			isError: true,
			text: "jeans is not a type. list_types names the types.",
		});
	});

	test("refuses a colour in a filter that is not the account's", async () => {
		// Given
		const { ai } = await withAiSession();
		await savedId(ai, three(await colourIds(ai)));
		// When
		const { isError, text } = await ai.call("list_combinations", {
			pieces: [{ colourId: "not-a-colour" }],
		});
		// Then
		expect({ isError, text }).toEqual({
			isError: true,
			text: "not-a-colour is not one of your colours. list_colours names them.",
		});
	});

	test("says no combination matches the filters", async () => {
		// Given
		const { ai } = await withAiSession();
		await savedId(ai, three(await colourIds(ai)));
		// When
		const { isError, text } = await ai.call("list_combinations", {
			pieces: [{ typeId: "sweater" }],
		});
		// Then
		expect({ isError, text }).toEqual({
			isError: false,
			text: "No combination matches these filters.",
		});
	});
});

describe("owned items", () => {
	type Listed = {
		id: string;
		typeId: string;
		colour: { name: string };
		brand: { name: string } | null;
		quantity: number;
	};

	async function navyId(ai: Session) {
		const { data } = await ai.call("list_colours");
		return (data as { colours: Colour[] }).colours.find(
			(c) => c.name === "Navy",
		)?.id;
	}

	// A Navy long button-up, no brand, two of them.
	const shirt = async (ai: Session) => ({
		typeId: "shirt_l",
		colourId: await navyId(ai),
		quantity: 2,
	});

	test("adds an owned item and lists it", async () => {
		// Given
		const { ai } = await withAiSession();
		const args = await shirt(ai);
		// When
		await ai.call("add_owned_item", args);
		const { data } = await ai.call("list_owned_items");
		// Then
		expect(
			(data as { ownedItems: Listed[] }).ownedItems.map((i) => [
				i.typeId,
				i.colour.name,
				i.brand,
				i.quantity,
			]),
		).toEqual([["shirt_l", "Navy", null, 2]]);
	});

	test("refuses the same piece and brand a second time as a sentence", async () => {
		// Given
		const { ai } = await withAiSession();
		const args = await shirt(ai);
		await ai.call("add_owned_item", args);
		// When
		const { isError, text } = await ai.call("add_owned_item", args);
		// Then
		expect({ isError, text }).toEqual({
			isError: true,
			text: "You have this item already. Change its number.",
		});
	});

	test("refuses a quantity of 0 as a sentence", async () => {
		// Given
		const { ai } = await withAiSession();
		const args = await shirt(ai);
		// When
		const { isError, text } = await ai.call("add_owned_item", {
			...args,
			quantity: 0,
		});
		// Then
		expect({ isError, text }).toEqual({
			isError: true,
			text: "Quantity is a whole number from 1 to 99.",
		});
	});

	test("refuses item number 501 as a sentence", async () => {
		// Given
		const { h, ai, userId } = await withAiSession();
		const args = await shirt(ai);
		await h.seedOwnedItems(userId, 500);
		// When
		const { isError, text } = await ai.call("add_owned_item", args);
		// Then
		expect({ isError, text }).toEqual({
			isError: true,
			text: "You have 500 items. That is the limit. Delete one to add a new one.",
		});
	});

	test("changes an owned item", async () => {
		// Given
		const { ai } = await withAiSession();
		const added = await ai.call("add_owned_item", await shirt(ai));
		const { id } = (added.data as { ownedItem: Listed }).ownedItem;
		// When
		const { data } = await ai.call("change_owned_item", {
			id,
			brandId: null,
			quantity: 5,
		});
		// Then
		expect((data as { ownedItem: Listed }).ownedItem.quantity).toBe(5);
	});

	test("deletes an owned item", async () => {
		// Given
		const { ai } = await withAiSession();
		const added = await ai.call("add_owned_item", await shirt(ai));
		const { id } = (added.data as { ownedItem: Listed }).ownedItem;
		// When
		await ai.call("delete_owned_item", { id });
		const { isError, text } = await ai.call("list_owned_items");
		// Then
		expect({ isError, text }).toEqual({
			isError: false,
			text: "Nothing in your closet yet.",
		});
	});

	// A draft picture uploaded as the session's browser, by id.
	// The shirt with these pictures, added as the website adds it, by id.
	const addWithPictures = async (
		h: Harness,
		ai: Session,
		pictureIds: string[],
	) => {
		const id = crypto.randomUUID();
		const res = await send(h, ai.jar, "POST", "/api/owned-items", {
			...(await shirt(ai)),
			id,
			brandId: null,
			pictureIds,
		});
		expect(res.status).toBe(201);
		return id;
	};

	test("deletes an owned item with its pictures", async () => {
		// Given
		const { h, ai } = await withAiSession();
		const a = await uploadPicture(h, ai.jar);
		const id = await addWithPictures(h, ai, [a]);
		// When
		await ai.call("delete_owned_item", { id });
		// Then
		expect(h.pictures.keys()).toEqual([]);
	});

	test("lists the picture ids of each item in upload order", async () => {
		// Given
		const { h, ai } = await withAiSession();
		const a = await uploadPicture(h, ai.jar);
		const b = await uploadPicture(h, ai.jar);
		await addWithPictures(h, ai, [a, b]);
		// When
		const { data } = await ai.call("list_owned_items");
		// Then
		const [item] = (data as { ownedItems: { pictureIds: string[] }[] })
			.ownedItems;
		expect(item.pictureIds).toEqual([a, b]);
	});

	test("says there is no such owned item", async () => {
		// Given
		const { ai } = await withAiSession();
		// When
		const { isError, text } = await ai.call("delete_owned_item", {
			id: "00000000-0000-4000-8000-000000000000",
		});
		// Then
		expect({ isError, text }).toEqual({
			isError: true,
			text: "No owned item with this id.",
		});
	});

	// A COS brand and, oldest first: a Navy sweater from COS, a Navy long tee
	// with no brand, a White long tee from COS.
	async function filterCloset(ai: Session) {
		const brand = await ai.call("add_brand", { name: "COS" });
		const cosId = (brand.data as { brand: { id: string } }).brand.id;
		const { data } = await ai.call("list_colours");
		const colours = (data as { colours: Colour[] }).colours;
		const navy = colours.find((c) => c.name === "Navy")?.id;
		const white = colours.find((c) => c.name === "White")?.id;
		const add = (typeId: string, colourId: unknown, brandId: string | null) =>
			ai.call("add_owned_item", { typeId, colourId, brandId, quantity: 1 });
		await add("sweater", navy, cosId);
		await add("tee_l", navy, null);
		await add("tee_l", white, cosId);
		return navy;
	}

	const pieces = (data: unknown) =>
		(data as { ownedItems: Listed[] }).ownedItems.map((i) => [
			i.typeId,
			i.colour.name,
		]);

	test("lists only the owned items that fit every filter given", async () => {
		// Given
		const { ai } = await withAiSession();
		const navy = await filterCloset(ai);
		// When
		const { data } = await ai.call("list_owned_items", {
			types: ["sweater", "tee_l"],
			colourIds: [navy],
		});
		// Then
		expect(pieces(data)).toEqual([
			["tee_l", "Navy"],
			["sweater", "Navy"],
		]);
	});

	test("lists the owned items with no brand for a null brand id", async () => {
		// Given
		const { ai } = await withAiSession();
		await filterCloset(ai);
		// When
		const { data } = await ai.call("list_owned_items", { brandIds: [null] });
		// Then
		expect(pieces(data)).toEqual([["tee_l", "Navy"]]);
	});

	test("refuses a type that is not one in a filter", async () => {
		// Given
		const { ai } = await withAiSession();
		const navy = await filterCloset(ai);
		// When
		const { isError, text } = await ai.call("list_owned_items", {
			types: ["sweater", "cape"],
			colourIds: [navy],
		});
		// Then
		expect({ isError, text }).toEqual({
			isError: true,
			text: "cape is not a type. list_types names the types.",
		});
	});

	test("refuses a colour that is not the account's in a filter", async () => {
		// Given
		const { ai } = await withAiSession();
		await filterCloset(ai);
		// When
		const { isError, text } = await ai.call("list_owned_items", {
			types: ["sweater", "tee_l"],
			colourIds: ["nope"],
		});
		// Then
		expect({ isError, text }).toEqual({
			isError: true,
			text: "nope is not one of your colours. list_colours names them.",
		});
	});

	test("says no owned item matches the filter", async () => {
		// Given
		const { ai } = await withAiSession();
		await filterCloset(ai);
		// When
		const { isError, text } = await ai.call("list_owned_items", {
			types: ["wool"],
		});
		// Then
		expect({ isError, text }).toEqual({
			isError: false,
			text: "No owned item matches the filter.",
		});
	});
});

describe("wishes", () => {
	type Link = {
		id: string;
		url: string;
		brand: { name: string } | null;
		name: string;
		price: number | null;
		pictureIds: string[];
	};
	type Listed = { id: string; typeId: string; shopLinks: Link[] };

	async function colourId(ai: Session, name: string) {
		const { data } = await ai.call("list_colours");
		return (data as { colours: Colour[] }).colours.find((c) => c.name === name)
			?.id;
	}

	// A Navy wool jacket, as a wish.
	async function addJacket(ai: Session) {
		const added = await ai.call("add_wish", {
			typeId: "wool",
			colourId: await colourId(ai, "Navy"),
		});
		return (added.data as { wish: Listed }).wish.id;
	}

	const cos = (wishId: string) => ({
		wishId,
		url: "https://cos.com/jacket",
		name: "Wool jacket",
		price: 4290000,
	});

	test("adds a wish and lists it with its shop links", async () => {
		// Given
		const { ai } = await withAiSession();
		// When
		const wishId = await addJacket(ai);
		await ai.call("add_shop_link", cos(wishId));
		const { data } = await ai.call("list_wishes");
		// Then
		const { wishes } = data as { wishes: Listed[] };
		expect(
			wishes.map((w) => ({
				typeId: w.typeId,
				shopLinks: w.shopLinks.map(({ id, ...link }) => ({
					hasId: typeof id === "string",
					...link,
				})),
			})),
		).toEqual([
			{
				typeId: "wool",
				shopLinks: [
					{
						hasId: true,
						url: "https://cos.com/jacket",
						brand: null,
						name: "Wool jacket",
						price: 4290000,
						pictureIds: [],
					},
				],
			},
		]);
	});

	// The jacket wish with the COS link, and the link's id.
	async function addJacketLink(ai: Session) {
		const added = await ai.call("add_shop_link", cos(await addJacket(ai)));
		return (added.data as { wish: Listed }).wish.shopLinks[0]?.id;
	}

	// `n` JPEG uploads saved on the link as the browser saves them, so these
	// cases do not lean on the AI tools.
	async function savePictures(
		h: Harness,
		ai: Session,
		id: string | undefined,
		n: number,
	) {
		const pictureIds: string[] = [];
		for (let i = 0; i < n; i++) {
			const body = bytes([0xff, 0xd8, 0xff, 0xe0], 100).fill(0x11 + i, 4);
			pictureIds.push(await uploadPicture(h, ai.jar, body));
		}
		await send(h, ai.jar, "PUT", `/api/shop-links/${id}`, {
			url: "https://cos.com/jacket",
			brandId: null,
			name: "Wool jacket",
			price: 4290000,
			pictureIds,
		});
		return pictureIds;
	}

	test("marks a shop link as bought and answers the owned item", async () => {
		// Given
		const { h, ai } = await withAiSession();
		const id = await addJacketLink(ai);
		await savePictures(h, ai, id, 1);
		// When
		const { data } = await ai.call("mark_shop_link_bought", { id });
		const listed = await ai.call("list_wishes");
		// Then
		const { ownedItem } = data as {
			ownedItem: {
				id: string;
				typeId: string;
				colour: { name: string };
				brand: unknown;
				quantity: number;
				pictureIds: string[];
			};
		};
		expect({
			ownedItem: {
				id: typeof ownedItem.id,
				typeId: ownedItem.typeId,
				colour: ownedItem.colour.name,
				brand: ownedItem.brand,
				quantity: ownedItem.quantity,
				pictures: ownedItem.pictureIds.length,
			},
			pictureIds: "pictureIds" in ownedItem,
			wishes: (listed.data as { wishes: Listed[] }).wishes,
		}).toEqual({
			ownedItem: {
				id: "string",
				typeId: "wool",
				colour: "Navy",
				brand: null,
				quantity: 1,
				pictures: 1,
			},
			pictureIds: "pictureIds" in ownedItem,
			wishes: [],
		});
	});

	test("refuses Bought at 500 owned items as a sentence", async () => {
		// Given
		const { h, ai, userId } = await withAiSession();
		const id = await addJacketLink(ai);
		await h.seedOwnedItems(userId, 500);
		// When
		const { isError, text } = await ai.call("mark_shop_link_bought", { id });
		// Then
		expect({ isError, text }).toEqual({
			isError: true,
			text: "You have 500 items. That is the limit. Delete one to add a new one.",
		});
	});

	test("lists the picture ids of each shop link in upload order", async () => {
		// Given
		const { h, ai } = await withAiSession();
		const id = await addJacketLink(ai);
		const pictureIds = await savePictures(h, ai, id, 2);
		// When
		const { data } = await ai.call("list_wishes");
		// Then
		expect(
			(data as { wishes: Listed[] }).wishes.map((w) =>
				w.shopLinks.map((l) => l.pictureIds),
			),
		).toEqual([[pictureIds]]);
	});

	test("refuses a second wish for one piece as a sentence", async () => {
		// Given
		const { ai } = await withAiSession();
		await addJacket(ai);
		// When
		const { isError, text } = await ai.call("add_wish", {
			typeId: "wool",
			colourId: await colourId(ai, "Navy"),
		});
		// Then
		expect({ isError, text }).toEqual({
			isError: true,
			text: "You have this wish already.",
		});
	});

	test("refuses wish number 201 as a sentence", async () => {
		// Given
		const { h, ai, userId } = await withAiSession();
		await h.seedWishes(userId, 200);
		// When
		const { isError, text } = await ai.call("add_wish", {
			typeId: "train_p",
			colourId: await colourId(ai, "Mustard"),
		});
		// Then
		expect({ isError, text }).toEqual({
			isError: true,
			text: "You have 200 wishes. That is the limit. Delete one to add a new one.",
		});
	});

	test("adds, changes, and deletes a shop link", async () => {
		// Given
		const { ai } = await withAiSession();
		const wishId = await addJacket(ai);
		const added = await ai.call("add_shop_link", cos(wishId));
		const [link] = (added.data as { wish: Listed }).wish.shopLinks;
		// When
		const changed = await ai.call("change_shop_link", {
			id: link?.id,
			url: "https://cos.com/jacket",
			brandId: null,
			name: "Wool jacket",
			price: 3990000,
		});
		await ai.call("delete_shop_link", { id: link?.id });
		const { data } = await ai.call("list_wishes");
		// Then
		expect({
			price: (changed.data as { wish: Listed }).wish.shopLinks[0]?.price,
			after: (data as { wishes: Listed[] }).wishes[0]?.shopLinks,
		}).toEqual({ price: 3990000, after: [] });
	});

	test("refuses an address that is not http as a sentence", async () => {
		// Given
		const { ai } = await withAiSession();
		const wishId = await addJacket(ai);
		// When
		const { isError, text } = await ai.call("add_shop_link", {
			...cos(wishId),
			url: "ftp://cos.com/jacket",
		});
		// Then
		expect({ isError, text }).toEqual({
			isError: true,
			text: "Enter a web address that starts with https://.",
		});
	});

	test("refuses shop link number 11 as a sentence", async () => {
		// Given
		const { h, ai, userId } = await withAiSession();
		const wishId = await addJacket(ai);
		await h.seedShopLinks(userId, wishId, 10);
		// When
		const { isError, text } = await ai.call("add_shop_link", cos(wishId));
		// Then
		expect({ isError, text }).toEqual({
			isError: true,
			text: "10 shop links is the limit for one wish.",
		});
	});

	test("deletes a wish", async () => {
		// Given
		const { ai } = await withAiSession();
		const wishId = await addJacket(ai);
		await ai.call("add_shop_link", cos(wishId));
		// When
		await ai.call("delete_wish", { id: wishId });
		const { data } = await ai.call("list_wishes");
		// Then
		expect((data as { wishes: Listed[] }).wishes).toEqual([]);
	});

	test("refuses a wish id that is not the account's as a sentence", async () => {
		// Given
		const { ai } = await withAiSession();
		// When
		const { isError, text } = await ai.call("delete_wish", {
			id: "99999999-9999-4999-8999-999999999999",
		});
		// Then
		expect({ isError, text }).toEqual({
			isError: true,
			text: "No wish with this id.",
		});
	});

	test("refuses to delete a colour a wish uses as a sentence", async () => {
		// Given
		const { ai } = await withAiSession();
		await addJacket(ai);
		// When
		const { isError, text } = await ai.call("delete_colour", {
			id: await colourId(ai, "Navy"),
		});
		// Then
		expect({ isError, text }).toEqual({
			isError: true,
			text: "A combination, an owned item, or a wish uses Navy, so it stays. A colour in use cannot be deleted.",
		});
	});

	// A COS brand, and three wishes, oldest first: a Navy sweater with a COS
	// link, a Navy long tee with a link of no brand, Navy chino pants with no
	// link.
	async function filterWishes(ai: Session) {
		const brand = await ai.call("add_brand", { name: "COS" });
		const cosId = (brand.data as { brand: { id: string } }).brand.id;
		const navy = await colourId(ai, "Navy");
		const wishOf = async (typeId: string) => {
			const added = await ai.call("add_wish", { typeId, colourId: navy });
			return (added.data as { wish: Listed }).wish.id;
		};
		const link = (wishId: string, brandId: string | null) => ({
			wishId,
			url: "https://shop.example/a",
			brandId,
			name: "A piece",
		});
		await ai.call("add_shop_link", link(await wishOf("sweater"), cosId));
		await ai.call("add_shop_link", link(await wishOf("tee_l"), null));
		await wishOf("chino_p");
		return cosId;
	}

	test("lists the wishes with a shop link of a picked brand", async () => {
		// Given
		const { ai } = await withAiSession();
		const cosId = await filterWishes(ai);
		// When
		const { data } = await ai.call("list_wishes", { brandIds: [cosId] });
		// Then
		expect((data as { wishes: Listed[] }).wishes.map((w) => w.typeId)).toEqual([
			"sweater",
		]);
	});

	test("lists the wishes with a shop link with no brand for a null brand id", async () => {
		// Given
		const { ai } = await withAiSession();
		await filterWishes(ai);
		// When
		const { data } = await ai.call("list_wishes", { brandIds: [null] });
		// Then
		expect((data as { wishes: Listed[] }).wishes.map((w) => w.typeId)).toEqual([
			"tee_l",
		]);
	});

	test("refuses a brand that is not the account's in a wish filter", async () => {
		// Given
		const { ai } = await withAiSession();
		await filterWishes(ai);
		// When
		const { isError, text } = await ai.call("list_wishes", {
			brandIds: ["nope"],
		});
		// Then
		expect({ isError, text }).toEqual({
			isError: true,
			text: "nope is not one of your brands. list_brands names them.",
		});
	});

	test("refuses an empty brand id in a filter", async () => {
		// Given
		const { ai } = await withAiSession();
		await filterWishes(ai);
		// When
		const { isError, text } = await ai.call("list_wishes", {
			brandIds: ["", "nope"],
		});
		// Then
		expect({ isError, text }).toEqual({
			isError: true,
			text: " is not one of your brands. list_brands names them.",
		});
	});
});
