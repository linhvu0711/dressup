import { describe, expect, test } from "bun:test";
import type { OwnedItemId } from "@/closet/owned-item";
import type { PictureId } from "@/pictures/picture";
import { listColours } from "../colour-store";
import { picture } from "../db/picture-schema";
import type { Result } from "../result";
import {
	ALICE,
	BOB,
	type Harness,
	type Ids,
	JPEG,
	scopeOf,
	withAccount,
} from "../test/harness";
import type { ActionScope, Refusal } from "./action";
import { brandActions } from "./brands";
import { ownedItemActions } from "./owned-items";
import { pictureActions } from "./pictures";

const FIRST_ID = "11111111-1111-4111-8111-111111111111";
const SECOND_ID = "22222222-2222-4222-8222-222222222222";
const THIRD_ID = "33333333-3333-4333-8333-333333333333";

const colourIdsOf = async (h: Harness, person = ALICE): Promise<Ids> =>
	Object.fromEntries(
		(await listColours(h.db, person.id)).map((c) => [c.name, c.id]),
	);

async function withAlice() {
	const { h } = await withAccount();
	return { h, alice: scopeOf(h), ids: await colourIdsOf(h) };
}

// A setup step that must not be refused.
function held<T>(result: Result<T, Refusal>): T {
	if (!result.ok) throw new Error(`Refused: ${result.error.text}`);
	return result.value;
}

// Navy long button-up, no brand, two of them.
const shirt = (ids: Ids) => ({
	id: FIRST_ID,
	typeId: "shirt_l",
	colourId: ids.Navy,
	brandId: null as string | null,
	quantity: 2,
});

const addBrand = async (alice: ActionScope, name: string) =>
	held(await brandActions.add.run(alice, { name })).id;

const listed = async (alice: ActionScope) =>
	held(await ownedItemActions.list.run(alice, {}));

const uploads = async (alice: ActionScope, n: number) => {
	const ids: PictureId[] = [];
	for (let i = 0; i < n; i++)
		ids.push(
			held(await pictureActions.add.run(alice, { bytes: JPEG.slice().buffer }))
				.id,
		);
	return ids;
};

const sorted = (ids: string[]) => [...ids].sort();

const QUANTITY_REFUSED = {
	code: "invalid",
	status: 400,
	body: { error: "invalid", field: "quantity" },
	text: "Quantity is a whole number from 1 to 99.",
} satisfies Refusal;

const DUPLICATE_ROW = (id: string) =>
	({
		code: "duplicate",
		status: 409,
		body: { error: "duplicate", id },
		text: "You have this item already. Change its number.",
	}) satisfies Refusal;

const ITEM_LIMIT_ROW = {
	code: "owned_item_limit",
	status: 409,
	body: { error: "owned_item_limit" },
	text: "You have 500 items. That is the limit. Delete one to add a new one.",
} satisfies Refusal;

const PICTURE_LIMIT_ROW = {
	code: "picture_limit",
	status: 409,
	body: { error: "picture_limit" },
	text: "An owned item has at most 8 pictures.",
} satisfies Refusal;

const NOT_YOUR_PICTURE_ROW = {
	code: "invalid",
	status: 400,
	body: { error: "invalid", field: "pictureIds" },
	text: "pictureIds holds an id that is not your upload or a picture of this item. list_owned_items names the item's pictures; get_upload_address gives a new upload.",
} satisfies Refusal;

const NOT_FOUND_ROW = {
	code: "not_found",
	status: 404,
	body: { error: "not_found" },
	text: "No owned item with this id.",
} satisfies Refusal;

describe("adding an owned item", () => {
	test("lists the owned items newest first", async () => {
		// Given: alice adds a Navy long button-up, then a White short tee
		const { alice, ids } = await withAlice();
		await ownedItemActions.add.run(alice, { ...shirt(ids), quantity: 1 });
		await ownedItemActions.add.run(alice, {
			id: SECOND_ID,
			typeId: "tee_s",
			colourId: ids.White,
			brandId: null,
			quantity: 1,
		});
		// When
		const items = await listed(alice);
		// Then
		expect(items.map((item): string => item.id)).toEqual([SECOND_ID, FIRST_ID]);
	});

	test("adds the same item again with the same id once", async () => {
		// Given: alice added the shirt once
		const { alice, ids } = await withAlice();
		await ownedItemActions.add.run(alice, shirt(ids));
		// When
		const again = await ownedItemActions.add.run(alice, shirt(ids));
		// Then
		expect({
			ok: again.ok,
			created: again.ok && again.value.created,
			count: (await listed(alice)).length,
		}).toEqual({ ok: true, created: false, count: 1 });
	});

	test("writes the new quantity when the same item is sent again", async () => {
		// Given: alice added the shirt with 2
		const { alice, ids } = await withAlice();
		await ownedItemActions.add.run(alice, shirt(ids));
		// When
		const again = await ownedItemActions.add.run(alice, {
			...shirt(ids),
			quantity: 3,
		});
		// Then
		expect({
			ok: again.ok,
			created: again.ok && again.value.created,
			quantities: (await listed(alice)).map((item) => item.quantity),
		}).toEqual({ ok: true, created: false, quantities: [3] });
	});

	test("refuses the same piece with no brand a second time", async () => {
		// Given: alice has a Navy long button-up with no brand
		const { alice, ids } = await withAlice();
		await ownedItemActions.add.run(alice, shirt(ids));
		// When
		const added = await ownedItemActions.add.run(alice, {
			...shirt(ids),
			id: SECOND_ID,
		});
		// Then
		expect(added).toEqual({ ok: false, error: DUPLICATE_ROW(FIRST_ID) });
	});

	test("adds the same piece with another brand", async () => {
		// Given: alice has Zara and COS, and a Navy long button-up from Zara
		const { alice, ids } = await withAlice();
		const zara = await addBrand(alice, "Zara");
		const cos = await addBrand(alice, "COS");
		await ownedItemActions.add.run(alice, { ...shirt(ids), brandId: zara });
		// When
		const added = await ownedItemActions.add.run(alice, {
			...shirt(ids),
			id: SECOND_ID,
			brandId: cos,
		});
		// Then
		expect({
			ok: added.ok,
			created: added.ok && added.value.created,
			count: (await listed(alice)).length,
		}).toEqual({ ok: true, created: true, count: 2 });
	});

	test("refuses a quantity of 0", async () => {
		// Given: the passing body
		const { alice, ids } = await withAlice();
		// When
		const added = await ownedItemActions.add.run(alice, {
			...shirt(ids),
			quantity: 0,
		});
		// Then
		expect(added).toEqual({ ok: false, error: QUANTITY_REFUSED });
	});

	test("refuses a quantity of 100", async () => {
		// Given: the passing body
		const { alice, ids } = await withAlice();
		// When
		const added = await ownedItemActions.add.run(alice, {
			...shirt(ids),
			quantity: 100,
		});
		// Then
		expect(added).toEqual({ ok: false, error: QUANTITY_REFUSED });
	});

	test("refuses a quantity of 1.5", async () => {
		// Given: the passing body
		const { alice, ids } = await withAlice();
		// When
		const added = await ownedItemActions.add.run(alice, {
			...shirt(ids),
			quantity: 1.5,
		});
		// Then
		expect(added).toEqual({ ok: false, error: QUANTITY_REFUSED });
	});

	test("refuses a type that is not in the list", async () => {
		// Given: the passing body
		const { alice, ids } = await withAlice();
		// When
		const added = await ownedItemActions.add.run(alice, {
			...shirt(ids),
			typeId: "cape",
		});
		// Then
		expect(added).toEqual({
			ok: false,
			error: {
				code: "invalid",
				status: 400,
				body: { error: "invalid", field: "typeId" },
				text: "cape is not a type. list_types names the types.",
			},
		});
	});

	test("refuses a colour that is not the account's", async () => {
		// Given: the passing body; bob's Navy id
		const { h, alice, ids } = await withAlice();
		await h.addAccount(BOB);
		const bobIds = await colourIdsOf(h, BOB);
		// When
		const added = await ownedItemActions.add.run(alice, {
			...shirt(ids),
			colourId: bobIds.Navy,
		});
		// Then
		expect(added).toEqual({
			ok: false,
			error: {
				code: "invalid",
				status: 400,
				body: { error: "invalid", field: "colourId" },
				text: `${bobIds.Navy} is not one of your colours. list_colours names them.`,
			},
		});
	});

	test("refuses a brand that is not the account's", async () => {
		// Given: the passing body; bob has Zara
		const { h, alice, ids } = await withAlice();
		await h.addAccount(BOB);
		const bobZara = await addBrand(scopeOf(h, BOB), "Zara");
		// When
		const added = await ownedItemActions.add.run(alice, {
			...shirt(ids),
			brandId: bobZara,
		});
		// Then
		expect(added).toEqual({
			ok: false,
			error: {
				code: "invalid",
				status: 400,
				body: { error: "invalid", field: "brandId" },
				text: `${bobZara} is not one of your brands. list_brands names them.`,
			},
		});
	});

	test("refuses item number 501", async () => {
		// Given: alice with 500 owned items, each with a brand
		const { h, alice, ids } = await withAlice();
		await h.seedOwnedItems(ALICE.id, 500);
		// When
		const added = await ownedItemActions.add.run(alice, shirt(ids));
		// Then
		expect({
			added,
			count: (await listed(alice)).length,
		}).toEqual({
			added: { ok: false, error: ITEM_LIMIT_ROW },
			count: 500,
		});
	});
});

describe("changing an owned item", () => {
	test("refuses a change to a brand another item of the piece has", async () => {
		// Given: brand Zara; item A shirt_l Navy Zara; item B shirt_l Navy no brand
		const { alice, ids } = await withAlice();
		const zara = await addBrand(alice, "Zara");
		await ownedItemActions.add.run(alice, { ...shirt(ids), brandId: zara });
		await ownedItemActions.add.run(alice, { ...shirt(ids), id: SECOND_ID });
		// When
		const changed = await ownedItemActions.change.run(alice, {
			id: SECOND_ID,
			brandId: zara,
			quantity: 1,
		});
		// Then
		expect(changed).toEqual({ ok: false, error: DUPLICATE_ROW(FIRST_ID) });
	});

	test("changes the quantity of one of two no-brand items of a piece", async () => {
		// Given: brands Zara and COS; items A shirt_l Navy Zara and B shirt_l
		// Navy COS; Zara and COS deleted, so A and B both have no brand
		const { alice, ids } = await withAlice();
		const zara = await addBrand(alice, "Zara");
		const cos = await addBrand(alice, "COS");
		await ownedItemActions.add.run(alice, { ...shirt(ids), brandId: zara });
		await ownedItemActions.add.run(alice, {
			...shirt(ids),
			id: SECOND_ID,
			brandId: cos,
		});
		await brandActions.delete.run(alice, { id: zara });
		await brandActions.delete.run(alice, { id: cos });
		// When
		const changed = await ownedItemActions.change.run(alice, {
			id: FIRST_ID,
			brandId: null,
			quantity: 5,
		});
		// Then
		expect({
			ok: changed.ok,
			quantity: changed.ok && changed.value.quantity,
		}).toEqual({ ok: true, quantity: 5 });
	});
});

describe("adds at once", () => {
	test("refuses one of two adds that overlap at 499 items", async () => {
		// Given: alice with 499 owned items, each with a brand; two adds of
		// other pieces with no brand
		const { h, alice, ids } = await withAlice();
		await h.seedOwnedItems(ALICE.id, 499);
		// When
		const results = await Promise.all([
			ownedItemActions.add.run(alice, shirt(ids)),
			ownedItemActions.add.run(alice, {
				...shirt(ids),
				id: SECOND_ID,
				typeId: "tee_l",
			}),
		]);
		// Then
		expect({
			count: (await listed(alice)).length,
			oks: results.map((r) => r.ok).sort(),
			refused: results.flatMap((r) => (r.ok ? [] : [r.error])),
		}).toEqual({
			count: 500,
			oks: [false, true],
			refused: [ITEM_LIMIT_ROW],
		});
	});

	test("refuses the second of two adds of one piece and brand that overlap", async () => {
		// Given: alice; two adds of a Navy long button-up with no brand
		const { alice, ids } = await withAlice();
		// When
		const [first, second] = await Promise.all([
			ownedItemActions.add.run(alice, shirt(ids)),
			ownedItemActions.add.run(alice, { ...shirt(ids), id: THIRD_ID }),
		]);
		// Then
		expect({
			first: first.ok,
			second,
			count: (await listed(alice)).length,
		}).toEqual({
			first: true,
			second: { ok: false, error: DUPLICATE_ROW(FIRST_ID) },
			count: 1,
		});
	});

	test("saves nothing when the colour goes during the add", async () => {
		// Given: alice; a trigger deletes Navy just before the item is written,
		// after the add's colour check passed
		const { h, alice, ids } = await withAlice();
		h.addTrigger(
			`CREATE TRIGGER drop_navy BEFORE INSERT ON owned_item WHEN NEW.colour_id = '${ids.Navy}' BEGIN DELETE FROM colour WHERE id = NEW.colour_id; END`,
		);
		// When
		const added = ownedItemActions.add.run(alice, shirt(ids));
		// Then
		await expect(added).rejects.toThrow();
		expect(await listed(alice)).toEqual([]);
	});
});

describe("pictures of an item", () => {
	test("adds an item with its pictures and lists them", async () => {
		// Given
		const { alice, ids } = await withAlice();
		const [a, b] = await uploads(alice, 2);
		// When
		const added = await ownedItemActions.add.run(alice, {
			...shirt(ids),
			pictureIds: [a, b],
		});
		const [item] = await listed(alice);
		// Then
		expect({
			ok: added.ok,
			answered: added.ok && added.value.ownedItem.pictureIds,
			listed: item.pictureIds,
		}).toEqual({ ok: true, answered: [a, b], listed: [a, b] });
	});

	test("lists an item with no pictures and no drafts", async () => {
		// Given
		const { alice, ids } = await withAlice();
		await ownedItemActions.add.run(alice, shirt(ids));
		await uploads(alice, 1);
		// When
		const [item] = await listed(alice);
		// Then
		expect(item.pictureIds).toEqual([]);
	});

	test("removes a picture left out of the list, from the bucket too", async () => {
		// Given
		const { h, alice, ids } = await withAlice();
		const [a, b] = await uploads(alice, 2);
		await ownedItemActions.add.run(alice, {
			...shirt(ids),
			pictureIds: [a, b],
		});
		// When
		const changed = await ownedItemActions.change.run(alice, {
			id: FIRST_ID,
			brandId: null,
			quantity: 1,
			pictureIds: [b],
		});
		const loaded = await pictureActions.read.run(alice, { id: a });
		// Then
		expect({
			ok: changed.ok,
			pictureIds: changed.ok && changed.value.pictureIds,
			loaded: loaded.ok ? 200 : loaded.error.status,
			keys: h.pictures.keys(),
		}).toEqual({ ok: true, pictureIds: [b], loaded: 404, keys: [b] });
	});

	test("keeps the pictures when a change leaves pictureIds out", async () => {
		// Given
		const { h, alice, ids } = await withAlice();
		const [a, b] = await uploads(alice, 2);
		await ownedItemActions.add.run(alice, {
			...shirt(ids),
			pictureIds: [a, b],
		});
		// When
		const changed = await ownedItemActions.change.run(alice, {
			id: FIRST_ID,
			brandId: null,
			quantity: 3,
		});
		// Then
		expect({
			ok: changed.ok,
			quantity: changed.ok && changed.value.quantity,
			pictureIds: changed.ok && changed.value.pictureIds,
			keys: h.pictures.keys(),
		}).toEqual({
			ok: true,
			quantity: 3,
			pictureIds: [a, b],
			keys: sorted([a, b]),
		});
	});

	test("keeps the pictures when a change is refused as duplicate", async () => {
		// Given: a Zara shirt, and a no-brand shirt of the same piece with two
		// pictures
		const { h, alice, ids } = await withAlice();
		const zara = await addBrand(alice, "Zara");
		await ownedItemActions.add.run(alice, { ...shirt(ids), brandId: zara });
		const [a, b] = await uploads(alice, 2);
		await ownedItemActions.add.run(alice, {
			...shirt(ids),
			id: SECOND_ID,
			pictureIds: [a, b],
		});
		// When
		const refused = await ownedItemActions.change.run(alice, {
			id: SECOND_ID,
			brandId: zara,
			quantity: 1,
			pictureIds: [],
		});
		const second = (await listed(alice)).find((i) => i.id === SECOND_ID);
		// Then
		expect({
			refused,
			pictureIds: second?.pictureIds,
			keys: h.pictures.keys(),
		}).toEqual({
			refused: { ok: false, error: DUPLICATE_ROW(FIRST_ID) },
			pictureIds: [a, b],
			keys: sorted([a, b]),
		});
	});

	test("saves the same list twice to the same state", async () => {
		// Given
		const { h, alice, ids } = await withAlice();
		const [a, b] = await uploads(alice, 2);
		await ownedItemActions.add.run(alice, {
			...shirt(ids),
			pictureIds: [a, b],
		});
		const change = {
			id: FIRST_ID,
			brandId: null,
			quantity: 1,
			pictureIds: [a, b],
		};
		// When
		const first = await ownedItemActions.change.run(alice, change);
		const second = await ownedItemActions.change.run(alice, change);
		// Then
		expect({
			oks: [first.ok, second.ok],
			lists: [
				first.ok && first.value.pictureIds,
				second.ok && second.value.pictureIds,
			],
			keys: h.pictures.keys(),
		}).toEqual({
			oks: [true, true],
			lists: [
				[a, b],
				[a, b],
			],
			keys: sorted([a, b]),
		});
	});

	test("takes the list again when an add is sent twice", async () => {
		// Given
		const { alice, ids } = await withAlice();
		const [a, b] = await uploads(alice, 2);
		await ownedItemActions.add.run(alice, { ...shirt(ids), pictureIds: [a] });
		// When
		const again = await ownedItemActions.add.run(alice, {
			...shirt(ids),
			pictureIds: [a, b],
		});
		// Then
		expect({
			ok: again.ok,
			created: again.ok && again.value.created,
			pictureIds: again.ok && again.value.ownedItem.pictureIds,
		}).toEqual({ ok: true, created: false, pictureIds: [a, b] });
	});

	test("adds an item with 8 pictures", async () => {
		// Given
		const { alice, ids } = await withAlice();
		const eight = await uploads(alice, 8);
		// When
		const added = await ownedItemActions.add.run(alice, {
			...shirt(ids),
			pictureIds: eight,
		});
		// Then
		expect({
			ok: added.ok,
			pictureIds: added.ok && added.value.ownedItem.pictureIds,
		}).toEqual({ ok: true, pictureIds: eight });
	});

	test("refuses an item with 9 pictures", async () => {
		// Given
		const { alice, ids } = await withAlice();
		const nine = await uploads(alice, 9);
		// When
		const refused = await ownedItemActions.add.run(alice, {
			...shirt(ids),
			pictureIds: nine,
		});
		// Then
		expect({ refused, listed: await listed(alice) }).toEqual({
			refused: { ok: false, error: PICTURE_LIMIT_ROW },
			listed: [],
		});
	});

	test("refuses a picture of another account in the list", async () => {
		// Given
		const { h, alice, ids } = await withAlice();
		const [a] = await uploads(alice, 1);
		await h.addAccount(BOB);
		const [bobs] = await uploads(scopeOf(h, BOB), 1);
		// When
		const refused = await ownedItemActions.add.run(alice, {
			...shirt(ids),
			pictureIds: [a, bobs],
		});
		// Then
		expect(refused).toEqual({ ok: false, error: NOT_YOUR_PICTURE_ROW });
	});

	test("refuses a picture of another item in the list", async () => {
		// Given: a Navy tee with picture o
		const { alice, ids } = await withAlice();
		const [o, a] = await uploads(alice, 2);
		await ownedItemActions.add.run(alice, {
			...shirt(ids),
			id: SECOND_ID,
			typeId: "tee_l",
			pictureIds: [o],
		});
		// When
		const refused = await ownedItemActions.add.run(alice, {
			...shirt(ids),
			pictureIds: [a, o],
		});
		const other = (await listed(alice)).find((i) => i.id === SECOND_ID);
		// Then
		expect({ refused, other: other?.pictureIds }).toEqual({
			refused: { ok: false, error: NOT_YOUR_PICTURE_ROW },
			other: [o],
		});
	});
});

describe("picture lists at once", () => {
	test("leaves one list when two saves of one item overlap", async () => {
		// Given: two lists of 8 drafts; the harness runs batches one at a time,
		// in the order they are sent
		const { h, alice, ids } = await withAlice();
		await ownedItemActions.add.run(alice, shirt(ids));
		const all = await uploads(alice, 16);
		const L1 = all.slice(0, 8);
		const L2 = all.slice(8);
		// When
		await Promise.all([
			ownedItemActions.change.run(alice, {
				id: FIRST_ID,
				brandId: null,
				quantity: 1,
				pictureIds: L1,
			}),
			ownedItemActions.change.run(alice, {
				id: FIRST_ID,
				brandId: null,
				quantity: 1,
				pictureIds: L2,
			}),
		]);
		const [item] = await listed(alice);
		// Then
		expect({ listed: item.pictureIds, objects: h.pictures.keys() }).toEqual({
			listed: L2,
			objects: sorted(L2),
		});
	});

	test("attaches nothing when the item goes during the change", async () => {
		// Given: another tab deletes the item just before the change's batch
		const { h, alice, ids } = await withAlice();
		await ownedItemActions.add.run(alice, shirt(ids));
		const [a] = await uploads(alice, 1);
		const { db } = h;
		const batch = db.batch;
		const otherTabFirst: typeof batch = async (items) => {
			db.batch = batch;
			await ownedItemActions.delete.run(alice, { id: FIRST_ID });
			return batch(items);
		};
		db.batch = otherTabFirst;
		// When
		const changed = await ownedItemActions.change.run(alice, {
			id: FIRST_ID,
			brandId: null,
			quantity: 1,
			pictureIds: [a],
		});
		const [row] = await h.rows(picture);
		// Then
		expect({ changed, owner: row?.ownedItemId }).toEqual({
			changed: { ok: false, error: NOT_FOUND_ROW },
			owner: null,
		});
	});
});

describe("deleting with pictures", () => {
	test("deletes an item with its pictures, from the bucket too", async () => {
		// Given
		const { h, alice, ids } = await withAlice();
		const [a, b, d] = await uploads(alice, 3);
		await ownedItemActions.add.run(alice, {
			...shirt(ids),
			pictureIds: [a, b],
		});
		// When
		const deleted = await ownedItemActions.delete.run(alice, { id: FIRST_ID });
		// Then
		expect({
			deleted,
			keys: h.pictures.keys(),
			rows: (await h.rows(picture)).map((row) => row.id),
		}).toEqual({
			deleted: { ok: true, value: FIRST_ID as OwnedItemId },
			keys: [d],
			rows: [d],
		});
	});
});

// A COS brand and, oldest first: a Navy sweater from COS, a Navy long tee
// with no brand, a White long tee from COS.
async function filterCloset(alice: ActionScope, ids: Ids) {
	const cos = await addBrand(alice, "COS");
	const add = (typeId: string, colourId: string, brandId: string | null) =>
		ownedItemActions.add.run(alice, {
			id: crypto.randomUUID(),
			typeId,
			colourId,
			brandId,
			quantity: 1,
		});
	await add("sweater", ids.Navy, cos);
	await add("tee_l", ids.Navy, null);
	await add("tee_l", ids.White, cos);
}

const pieces = (items: Awaited<ReturnType<typeof listed>>) =>
	items.map((i) => [i.typeId, i.colour.name]);

describe("listing with a filter", () => {
	test("lists only the owned items that fit every filter given", async () => {
		// Given: a closet of three items
		const { alice, ids } = await withAlice();
		await filterCloset(alice, ids);
		// When
		const items = await ownedItemActions.list.run(alice, {
			types: ["sweater", "tee_l"],
			colourIds: [ids.Navy],
		});
		// Then
		expect(pieces(held(items))).toEqual([
			["tee_l", "Navy"],
			["sweater", "Navy"],
		]);
	});

	test("lists the owned items with no brand for a null brand id", async () => {
		// Given: a closet of three items
		const { alice, ids } = await withAlice();
		await filterCloset(alice, ids);
		// When
		const items = await ownedItemActions.list.run(alice, { brandIds: [null] });
		// Then
		expect(pieces(held(items))).toEqual([["tee_l", "Navy"]]);
	});

	test("refuses a colour that is not the account's in a filter", async () => {
		// Given: a closet of three items
		const { alice, ids } = await withAlice();
		await filterCloset(alice, ids);
		// When
		const items = await ownedItemActions.list.run(alice, {
			types: ["sweater", "tee_l"],
			colourIds: ["nope"],
		});
		// Then
		expect(items).toEqual({
			ok: false,
			error: {
				code: "not_colour",
				status: 400,
				body: { error: "invalid", field: "colourIds" },
				text: "nope is not one of your colours. list_colours names them.",
			},
		});
	});
});
