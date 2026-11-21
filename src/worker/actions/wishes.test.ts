import { describe, expect, test } from "bun:test";
import type { PictureId } from "@/pictures/picture";
import type { ShopLinkId, WishId } from "@/wishlist/wish";
import { listColours } from "../colour-store";
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
import { shopLinkActions, wishActions } from "./wishes";

const FIRST_ID = "11111111-1111-4111-8111-111111111111";
const SECOND_ID = "22222222-2222-4222-8222-222222222222";
const LINK_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_LINK_ID = "44444444-4444-4444-8444-444444444444";
const ZARA_URL = "https://www.zara.com/vn/en/wool-blend-jacket.html";

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

// A Navy wool jacket.
const jacket = (ids: Ids) => ({
	id: FIRST_ID,
	typeId: "wool",
	colourId: ids.Navy,
});

// The Zara link to the Navy wool jacket.
const zaraLink = (brandId: string | null) => ({
	id: LINK_ID,
	url: ZARA_URL,
	brandId,
	name: "Wool blend jacket",
	price: 2990000,
});

const addLink = (
	alice: ActionScope,
	wishId: string,
	link: Omit<Parameters<typeof shopLinkActions.add.run>[1], "wishId">,
) => shopLinkActions.add.run(alice, { wishId, ...link });

const listed = async (alice: ActionScope) =>
	held(await wishActions.list.run(alice, {}));

const linksOf = async (alice: ActionScope) =>
	(await listed(alice))[0]?.shopLinks;

const addBrand = async (alice: ActionScope, name: string) =>
	held(await brandActions.add.run(alice, { name })).id;

const uploads = async (alice: ActionScope, n: number) => {
	const ids: PictureId[] = [];
	for (let i = 0; i < n; i++)
		ids.push(
			held(await pictureActions.add.run(alice, { bytes: JPEG.slice().buffer }))
				.id,
		);
	return ids;
};

const SHOP_LINK_NOT_FOUND = {
	code: "not_found",
	status: 404,
	body: { error: "not_found" },
	text: "No shop link with this id.",
} satisfies Refusal;

const WISH_NOT_FOUND = {
	code: "not_found",
	status: 404,
	body: { error: "not_found" },
	text: "No wish with this id.",
} satisfies Refusal;

const WISH_LIMIT_ROW = {
	code: "wish_limit",
	status: 409,
	body: { error: "wish_limit" },
	text: "You have 200 wishes. That is the limit. Delete one to add a new one.",
} satisfies Refusal;

const SHOP_LINK_LIMIT_ROW = {
	code: "shop_link_limit",
	status: 409,
	body: { error: "shop_link_limit" },
	text: "10 shop links is the limit for one wish.",
} satisfies Refusal;

const PICTURE_LIMIT_ROW = {
	code: "picture_limit",
	status: 409,
	body: { error: "picture_limit" },
	text: "A shop link has at most 8 pictures.",
} satisfies Refusal;

const NOT_YOUR_PICTURE_ROW = {
	code: "invalid",
	status: 400,
	body: { error: "invalid", field: "pictureIds" },
	text: "pictureIds holds an id that is not your upload or a picture of this shop link. list_wishes names the link's pictures; get_upload_address gives a new upload.",
} satisfies Refusal;

const CONFLICT_ROW = {
	code: "conflict",
	status: 409,
	body: { error: "conflict", field: "id" },
	text: "dressup could not do this. Try again.",
} satisfies Refusal;

describe("adding a wish", () => {
	test("lists wishes newest first", async () => {
		// Given: alice with a wish for a White short tee, then a Navy wool jacket
		const { alice, ids } = await withAlice();
		await wishActions.add.run(alice, {
			id: SECOND_ID,
			typeId: "tee_s",
			colourId: ids.White,
		});
		await wishActions.add.run(alice, jacket(ids));
		// When
		const wishes = await listed(alice);
		// Then
		expect(wishes.map((wish) => wish.typeId)).toEqual(["wool", "tee_s"]);
	});

	test("gives back the same wish when an add is sent twice", async () => {
		// Given: alice; the add of the Navy wool jacket sent once
		const { alice, ids } = await withAlice();
		await wishActions.add.run(alice, jacket(ids));
		// When
		const again = await wishActions.add.run(alice, jacket(ids));
		// Then
		expect({
			ok: again.ok,
			created: again.ok && again.value.created,
			count: (await listed(alice)).length,
		}).toEqual({ ok: true, created: false, count: 1 });
	});

	test("refuses a wish id another account added", async () => {
		// Given: bob added his Navy wool jacket under FIRST_ID
		const { h, alice, ids } = await withAlice();
		await h.addAccount(BOB);
		held(
			await wishActions.add.run(
				scopeOf(h, BOB),
				jacket(await colourIdsOf(h, BOB)),
			),
		);
		// When
		const added = await wishActions.add.run(alice, jacket(ids));
		// Then
		expect({ added, count: (await listed(alice)).length }).toEqual({
			added: { ok: false, error: CONFLICT_ROW },
			count: 0,
		});
	});

	test("refuses a wish id held by a wish for another piece", async () => {
		// Given: alice wished the Navy wool jacket under FIRST_ID
		const { alice, ids } = await withAlice();
		held(await wishActions.add.run(alice, jacket(ids)));
		// When
		const added = await wishActions.add.run(alice, {
			...jacket(ids),
			colourId: ids.Black,
		});
		// Then
		expect({ added, count: (await listed(alice)).length }).toEqual({
			added: { ok: false, error: CONFLICT_ROW },
			count: 1,
		});
	});

	test("adds a wish for a piece the closet holds", async () => {
		// Given: alice with an owned Navy wool jacket, no brand, quantity 1
		const { alice, ids } = await withAlice();
		await ownedItemActions.add.run(alice, {
			id: SECOND_ID,
			typeId: "wool",
			colourId: ids.Navy,
			brandId: null,
			quantity: 1,
		});
		// When
		const added = await wishActions.add.run(alice, jacket(ids));
		// Then
		expect({
			ok: added.ok,
			created: added.ok && added.value.created,
			owned: held(await ownedItemActions.list.run(alice, {})).length,
		}).toEqual({ ok: true, created: true, owned: 1 });
	});

	test("refuses wish number 201", async () => {
		// Given: alice with 200 wishes
		const { h, alice, ids } = await withAlice();
		await h.seedWishes(ALICE.id, 200);
		// When: a Mustard training pant, a piece the seed does not hold
		const added = await wishActions.add.run(alice, {
			id: FIRST_ID,
			typeId: "train_p",
			colourId: ids.Mustard,
		});
		// Then
		expect({ added, count: (await listed(alice)).length }).toEqual({
			added: { ok: false, error: WISH_LIMIT_ROW },
			count: 200,
		});
	});

	test("refuses a type that is not a type", async () => {
		// Given: the add of the Navy wool jacket with the type "cape"
		const { alice, ids } = await withAlice();
		// When
		const added = await wishActions.add.run(alice, {
			...jacket(ids),
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

	test("refuses a colour of another account", async () => {
		// Given: the add of the Navy wool jacket with bob's Navy
		const { h, alice } = await withAlice();
		await h.addAccount(BOB);
		const bobIds = await colourIdsOf(h, BOB);
		// When
		const added = await wishActions.add.run(alice, jacket(bobIds));
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
});

describe("deleting a wish", () => {
	test("answers not_found for a wish of another account", async () => {
		// Given: bob with the wish FIRST_ID
		const { h, alice } = await withAlice();
		await h.addAccount(BOB);
		const bob = scopeOf(h, BOB);
		await wishActions.add.run(bob, jacket(await colourIdsOf(h, BOB)));
		// When
		const deleted = await wishActions.delete.run(alice, { id: FIRST_ID });
		// Then
		expect({
			deleted,
			bob: (await listed(bob)).length,
		}).toEqual({
			deleted: { ok: false, error: WISH_NOT_FOUND },
			bob: 1,
		});
	});

	test("deletes a wish with its shop links", async () => {
		// Given: alice's wish with 2 links
		const { h, alice, ids } = await withAlice();
		await wishActions.add.run(alice, jacket(ids));
		await h.seedShopLinks(ALICE.id, FIRST_ID, 2);
		// When
		const deleted = await wishActions.delete.run(alice, { id: FIRST_ID });
		// Then
		expect({
			deleted,
			links: h.accountRows(ALICE.id).shop_link,
		}).toEqual({
			deleted: { ok: true, value: FIRST_ID as WishId },
			links: 0,
		});
	});
});

describe("wish adds at once", () => {
	test("refuses one of two adds that overlap at 199 wishes", async () => {
		// Given: alice with 199 wishes; two adds of pieces the seed does not hold
		const { h, alice, ids } = await withAlice();
		await h.seedWishes(ALICE.id, 199);
		// When
		const results = await Promise.all([
			wishActions.add.run(alice, {
				id: FIRST_ID,
				typeId: "train_p",
				colourId: ids.Mustard,
			}),
			wishActions.add.run(alice, {
				id: SECOND_ID,
				typeId: "train_sh",
				colourId: ids.Mustard,
			}),
		]);
		// Then
		expect({
			count: (await listed(alice)).length,
			oks: results.map((r) => r.ok).sort(),
			refused: results.flatMap((r) => (r.ok ? [] : [r.error])),
		}).toEqual({
			count: 200,
			oks: [false, true],
			refused: [WISH_LIMIT_ROW],
		});
	});

	test("gives back the same wish to two adds of one id that overlap", async () => {
		// Given: alice; the add of a Navy wool jacket sent twice at once
		const { alice, ids } = await withAlice();
		// When
		const results = await Promise.all([
			wishActions.add.run(alice, jacket(ids)),
			wishActions.add.run(alice, jacket(ids)),
		]);
		// Then
		expect({
			created: results.map((r) => r.ok && r.value.created).sort(),
			oks: results.map((r) => r.ok),
			count: (await listed(alice)).length,
		}).toEqual({ created: [false, true], oks: [true, true], count: 1 });
	});

	test("refuses the second of two adds of one piece that overlap", async () => {
		// Given: alice; two adds of a Navy wool jacket
		const { alice, ids } = await withAlice();
		// When
		const results = await Promise.all([
			wishActions.add.run(alice, jacket(ids)),
			wishActions.add.run(alice, { ...jacket(ids), id: SECOND_ID }),
		]);
		// Then
		const wishes = await listed(alice);
		expect({
			count: wishes.length,
			oks: results.map((r) => r.ok).sort(),
			refused: results.flatMap((r) => (r.ok ? [] : [r.error])),
		}).toEqual({
			count: 1,
			oks: [false, true],
			refused: [
				{
					code: "duplicate",
					status: 409,
					body: { error: "duplicate", id: wishes[0]?.id },
					text: "You have this wish already.",
				},
			],
		});
	});
});

describe("adding to the wishlist", () => {
	// The Navy wool jacket with the Zara link, as the one form sends it.
	const jacketWithLink = (ids: Ids) => ({
		...jacket(ids),
		shopLink: zaraLink(null),
	});

	const linkRows = (h: Harness) => h.accountRows(ALICE.id).shop_link ?? 0;

	test("refuses a new wish with its link at 200 wishes", async () => {
		// Given: alice with 200 wishes
		const { h, alice, ids } = await withAlice();
		await h.seedWishes(ALICE.id, 200);
		// When: a Mustard training pant, a piece the seed does not hold
		const added = await wishActions.addToWishlist.run(alice, {
			id: FIRST_ID,
			typeId: "train_p",
			colourId: ids.Mustard,
			shopLink: zaraLink(null),
		});
		// Then
		expect({
			added,
			wishes: (await listed(alice)).length,
			links: linkRows(h),
		}).toEqual({
			added: { ok: false, error: WISH_LIMIT_ROW },
			wishes: 200,
			links: 0,
		});
	});

	test("refuses a wishlist add with a colour of another account", async () => {
		// Given: the Navy wool jacket with bob's Navy
		const { h, alice } = await withAlice();
		await h.addAccount(BOB);
		const bobIds = await colourIdsOf(h, BOB);
		// When
		const added = await wishActions.addToWishlist.run(
			alice,
			jacketWithLink(bobIds),
		);
		// Then
		expect({ added, wishes: await listed(alice) }).toEqual({
			added: {
				ok: false,
				error: {
					code: "invalid",
					status: 400,
					body: { error: "invalid", field: "colourId" },
					text: `${bobIds.Navy} is not one of your colours. list_colours names them.`,
				},
			},
			wishes: [],
		});
	});

	test("refuses a wishlist add with a brand of another account", async () => {
		// Given: the Zara link with bob's brand Zara
		const { h, alice, ids } = await withAlice();
		await h.addAccount(BOB);
		const bobZara = await addBrand(scopeOf(h, BOB), "Zara");
		// When
		const added = await wishActions.addToWishlist.run(alice, {
			...jacket(ids),
			shopLink: zaraLink(bobZara),
		});
		// Then
		expect({ added, wishes: await listed(alice) }).toEqual({
			added: {
				ok: false,
				error: {
					code: "invalid",
					status: 400,
					body: { error: "invalid", field: "brandId" },
					text: `${bobZara} is not one of your brands. list_brands names them.`,
				},
			},
			wishes: [],
		});
	});

	test("refuses a wishlist add with a wish id another account holds", async () => {
		// Given: bob's wish FIRST_ID for his Navy wool jacket
		const { h, alice, ids } = await withAlice();
		await h.addAccount(BOB);
		await wishActions.add.run(
			scopeOf(h, BOB),
			jacket(await colourIdsOf(h, BOB)),
		);
		// When
		const added = await wishActions.addToWishlist.run(
			alice,
			jacketWithLink(ids),
		);
		// Then
		expect({
			added,
			wishes: await listed(alice),
			links: linkRows(h),
		}).toEqual({
			added: { ok: false, error: CONFLICT_ROW },
			wishes: [],
			links: 0,
		});
	});

	test("refuses one of two wishlist adds that overlap at 199 wishes", async () => {
		// Given: alice with 199 wishes; two adds of pieces the seed does not
		// hold, each with its own link, both read before either batch runs
		const { h, alice, ids } = await withAlice();
		await h.seedWishes(ALICE.id, 199);
		const hold = h.holdBatches();
		// When
		const adds = [
			wishActions.addToWishlist.run(alice, {
				id: FIRST_ID,
				typeId: "train_p",
				colourId: ids.Mustard,
				shopLink: zaraLink(null),
			}),
			wishActions.addToWishlist.run(alice, {
				id: SECOND_ID,
				typeId: "train_sh",
				colourId: ids.Mustard,
				shopLink: { ...zaraLink(null), id: OTHER_LINK_ID },
			}),
		];
		await hold.queued(2);
		hold.release();
		const results = await Promise.all(adds);
		// Then
		expect({
			wishes: (await listed(alice)).length,
			links: linkRows(h),
			oks: results.map((r) => r.ok).sort(),
			refused: results.flatMap((r) => (r.ok ? [] : [r.error])),
		}).toEqual({
			wishes: 200,
			links: 1,
			oks: [false, true],
			refused: [WISH_LIMIT_ROW],
		});
	});

	// The piece of each wish with the ids of its links, newest wish first.
	const held = async (
		alice: ActionScope,
	): Promise<{ id: string; links: string[] }[]> =>
		(await listed(alice)).map((wish) => ({
			id: wish.id,
			links: wish.shopLinks.map((link) => link.id),
		}));

	test("adds the shop link to the wish the piece has", async () => {
		// Given: alice's wish FIRST_ID for the Navy wool jacket, no link
		const { alice, ids } = await withAlice();
		await wishActions.add.run(alice, jacket(ids));
		// When: the one form's add of that piece with a new wish id
		const added = await wishActions.addToWishlist.run(alice, {
			...jacketWithLink(ids),
			id: SECOND_ID,
		});
		// Then
		expect({
			ok: added.ok,
			created: added.ok && added.value.created,
			id: added.ok && (added.value.wish.id as string),
			wishes: await held(alice),
		}).toEqual({
			ok: true,
			created: true,
			id: FIRST_ID,
			wishes: [{ id: FIRST_ID, links: [LINK_ID] }],
		});
	});

	test("adds a wish alone when no shop link comes", async () => {
		// Given: alice
		const { alice, ids } = await withAlice();
		// When
		const added = await wishActions.addToWishlist.run(alice, jacket(ids));
		// Then
		expect({
			ok: added.ok,
			created: added.ok && added.value.created,
			id: added.ok && (added.value.wish.id as string),
			shopLinks: added.ok && added.value.wish.shopLinks,
		}).toEqual({ ok: true, created: true, id: FIRST_ID, shopLinks: [] });
	});

	test("gives back the piece's wish when no shop link comes", async () => {
		// Given: alice's wish FIRST_ID with the Zara link
		const { alice, ids } = await withAlice();
		await wishActions.add.run(alice, jacket(ids));
		await addLink(alice, FIRST_ID, zaraLink(null));
		// When: the one form's add of that piece with no link, a new wish id
		const added = await wishActions.addToWishlist.run(alice, {
			...jacket(ids),
			id: SECOND_ID,
		});
		// Then
		expect({
			ok: added.ok,
			created: added.ok && added.value.created,
			id: added.ok && (added.value.wish.id as string),
			wishes: await held(alice),
		}).toEqual({
			ok: true,
			created: false,
			id: FIRST_ID,
			wishes: [{ id: FIRST_ID, links: [LINK_ID] }],
		});
	});

	test("refuses an 11th shop link through the wishlist add", async () => {
		// Given: alice's wish FIRST_ID with 10 links
		const { h, alice, ids } = await withAlice();
		await wishActions.add.run(alice, jacket(ids));
		await h.seedShopLinks(ALICE.id, FIRST_ID, 10);
		// When
		const added = await wishActions.addToWishlist.run(alice, {
			...jacketWithLink(ids),
			id: SECOND_ID,
		});
		// Then
		expect({
			added,
			links: linkRows(h),
			wishes: (await listed(alice)).length,
		}).toEqual({
			added: { ok: false, error: SHOP_LINK_LIMIT_ROW },
			links: 10,
			wishes: 1,
		});
	});

	test("joins two overlapping adds of one new piece into one wish", async () => {
		// Given: two adds of the Navy wool jacket with their own wish and link
		// ids, both read no wish before either batch runs
		const { h, alice, ids } = await withAlice();
		const hold = h.holdBatches();
		// When
		const adds = [
			wishActions.addToWishlist.run(alice, jacketWithLink(ids)),
			wishActions.addToWishlist.run(alice, {
				...jacket(ids),
				id: SECOND_ID,
				shopLink: { ...zaraLink(null), id: OTHER_LINK_ID },
			}),
		];
		await hold.queued(2);
		hold.release();
		const results = await Promise.all(adds);
		// Then
		expect({
			oks: results.map((r) => r.ok),
			wishes: await held(alice),
		}).toEqual({
			oks: [true, true],
			wishes: [{ id: FIRST_ID, links: [LINK_ID, OTHER_LINK_ID] }],
		});
	});

	test("adds the wish again when it is removed during a wishlist add", async () => {
		// Given: alice's wish FIRST_ID with no link; its delete waits in a
		// batch, so the add below reads the wish before it goes
		const { h, alice, ids } = await withAlice();
		await wishActions.add.run(alice, jacket(ids));
		const [a] = await uploads(alice, 1);
		const hold = h.holdBatches();
		const removing = wishActions.delete.run(alice, { id: FIRST_ID });
		await hold.queued(1);
		// When: the one form's add of that piece, with a picture, so its write
		// waits behind the delete
		const adding = wishActions.addToWishlist.run(alice, {
			...jacket(ids),
			id: SECOND_ID,
			shopLink: { ...zaraLink(null), pictureIds: [a ?? ""] },
		});
		await hold.queued(2);
		hold.release();
		const [, added] = await Promise.all([removing, adding]);
		// Then
		const [wish] = await listed(alice);
		expect({
			ok: added.ok,
			created: added.ok && added.value.created,
			wishes: (await held(alice)).length,
			id: wish?.id as string | undefined,
			links: wish?.shopLinks.map((link) => link.id as string),
			pictureIds: wish?.shopLinks[0]?.pictureIds as string[] | undefined,
		}).toEqual({
			ok: true,
			created: true,
			wishes: 1,
			id: SECOND_ID,
			links: [LINK_ID],
			pictureIds: [a],
		});
	});
});

describe("adding a shop link", () => {
	// Alice with the wish FIRST_ID for a Navy wool jacket and the brand Zara.
	async function aliceWithWish() {
		const { h, alice, ids } = await withAlice();
		await wishActions.add.run(alice, jacket(ids));
		return { h, alice, ids, zara: await addBrand(alice, "Zara") };
	}

	test("adds a shop link with no brand and no price", async () => {
		// Given
		const { alice } = await aliceWithWish();
		// When
		const added = await addLink(alice, FIRST_ID, {
			...zaraLink(null),
			price: null,
		});
		// Then
		const [link] = (await linksOf(alice)) ?? [];
		expect({
			ok: added.ok,
			brand: link?.brand,
			price: link?.price,
		}).toEqual({ ok: true, brand: null, price: null });
	});

	test("gives back the same shop link when an add is sent twice", async () => {
		// Given: the Zara link added once
		const { alice, zara } = await aliceWithWish();
		await addLink(alice, FIRST_ID, zaraLink(zara));
		// When
		const again = await addLink(alice, FIRST_ID, zaraLink(zara));
		// Then
		expect({
			ok: again.ok,
			created: again.ok && again.value.created,
			count: (await linksOf(alice))?.length,
		}).toEqual({ ok: true, created: false, count: 1 });
	});

	test("refuses a shop link id another account added", async () => {
		// Given: bob's own wish holds a link under LINK_ID
		const { h, alice } = await aliceWithWish();
		await h.addAccount(BOB);
		const bob = scopeOf(h, BOB);
		held(
			await wishActions.add.run(bob, {
				...jacket(await colourIdsOf(h, BOB)),
				id: SECOND_ID,
			}),
		);
		held(await addLink(bob, SECOND_ID, zaraLink(null)));
		// When
		const added = await addLink(alice, FIRST_ID, zaraLink(null));
		// Then
		expect({ added, links: (await linksOf(alice))?.length }).toEqual({
			added: { ok: false, error: CONFLICT_ROW },
			links: 0,
		});
	});

	test("refuses a shop link id held on another wish", async () => {
		// Given: alice's Black wool jacket wish holds a link under LINK_ID
		const { alice, ids } = await aliceWithWish();
		held(
			await wishActions.add.run(alice, {
				id: SECOND_ID,
				typeId: "wool",
				colourId: ids.Black,
			}),
		);
		held(await addLink(alice, SECOND_ID, zaraLink(null)));
		// When
		const added = await addLink(alice, FIRST_ID, zaraLink(null));
		// Then: the Black wish is newest, so first
		expect({
			added,
			counts: (await listed(alice)).map((w) => w.shopLinks.length),
		}).toEqual({ added: { ok: false, error: CONFLICT_ROW }, counts: [1, 0] });
	});

	const refusals: [string, Record<string, unknown>, string, string][] = [
		[
			"refuses an address that is not http or https",
			{ url: "javascript:alert(1)" },
			"url",
			"Enter a web address that starts with https://.",
		],
		[
			"refuses an address that does not parse",
			{ url: "https://[" },
			"url",
			"Enter a web address that starts with https://.",
		],
		[
			"refuses an address of 2,001 characters",
			{ url: `https://a.example/${"a".repeat(1983)}` },
			"url",
			"Enter a web address that starts with https://.",
		],
		["refuses an empty name", { name: "  " }, "name", "Enter a name."],
		[
			"refuses a name of 81 characters",
			{ name: "a".repeat(81) },
			"name",
			"Enter a name.",
		],
		[
			"refuses a price of 1.000.000.000",
			{ price: 1000000000 },
			"price",
			"Price is a whole number of VND from 1 to 999.999.999.",
		],
		[
			"refuses a price that is not whole",
			{ price: 1.5 },
			"price",
			"Price is a whole number of VND from 1 to 999.999.999.",
		],
	];
	for (const [name, change, field, text] of refusals)
		test(name, async () => {
			// Given: the Zara link with one field changed
			const { alice, zara } = await aliceWithWish();
			// When
			const added = await addLink(alice, FIRST_ID, {
				...zaraLink(zara),
				...change,
			});
			// Then
			expect(added).toEqual({
				ok: false,
				error: {
					code: "invalid",
					status: 400,
					body: { error: "invalid", field },
					text,
				},
			});
		});

	test("answers not_found for a shop link on a wish of another account", async () => {
		// Given: bob's wish FIRST_ID
		const { h, alice } = await withAlice();
		await h.addAccount(BOB);
		await wishActions.add.run(
			scopeOf(h, BOB),
			jacket(await colourIdsOf(h, BOB)),
		);
		// When
		const added = await addLink(alice, FIRST_ID, zaraLink(null));
		// Then
		expect(added).toEqual({ ok: false, error: WISH_NOT_FOUND });
	});

	test("refuses shop link number 11", async () => {
		// Given: alice's wish with 10 links
		const { h, alice, zara } = await aliceWithWish();
		await h.seedShopLinks(ALICE.id, FIRST_ID, 10);
		// When
		const added = await addLink(alice, FIRST_ID, zaraLink(zara));
		// Then
		expect({ added, count: (await linksOf(alice))?.length }).toEqual({
			added: { ok: false, error: SHOP_LINK_LIMIT_ROW },
			count: 10,
		});
	});

	test("adds a link to a wish while another wish holds 10 links", async () => {
		// Given: alice's Black wool jacket wish holds 10 links
		const { h, alice, ids } = await aliceWithWish();
		held(
			await wishActions.add.run(alice, {
				id: SECOND_ID,
				typeId: "wool",
				colourId: ids.Black,
			}),
		);
		await h.seedShopLinks(ALICE.id, SECOND_ID, 10);
		// When
		const added = await addLink(alice, FIRST_ID, zaraLink(null));
		// Then: the Black wish is newest, so first
		expect({
			ok: added.ok,
			counts: (await listed(alice)).map((w) => w.shopLinks.length),
		}).toEqual({ ok: true, counts: [10, 1] });
	});
});

describe("changing and deleting a shop link that is gone", () => {
	test("answers not_found on change", async () => {
		// Given: alice's wish with the Zara link; another id
		const { alice, ids } = await withAlice();
		await wishActions.add.run(alice, jacket(ids));
		await addLink(alice, FIRST_ID, zaraLink(null));
		// When
		const changed = await shopLinkActions.change.run(alice, {
			...zaraLink(null),
			id: OTHER_LINK_ID,
		});
		// Then
		expect(changed).toEqual({ ok: false, error: SHOP_LINK_NOT_FOUND });
	});

	test("answers not_found on delete", async () => {
		// Given: alice's wish with the Zara link; another id
		const { alice, ids } = await withAlice();
		await wishActions.add.run(alice, jacket(ids));
		await addLink(alice, FIRST_ID, zaraLink(null));
		// When
		const deleted = await shopLinkActions.delete.run(alice, {
			id: OTHER_LINK_ID,
		});
		// Then
		expect(deleted).toEqual({ ok: false, error: SHOP_LINK_NOT_FOUND });
	});
});

describe("the last shop link", () => {
	// Alice's wish FIRST_ID for a Navy wool jacket with the Zara link.
	async function aliceWithLink() {
		const { h, alice, ids } = await withAlice();
		await wishActions.add.run(alice, jacket(ids));
		await addLink(alice, FIRST_ID, zaraLink(null));
		return { h, alice, ids };
	}

	const held = async (
		alice: ActionScope,
	): Promise<{ id: string; links: string[] }[]> =>
		(await listed(alice)).map((wish) => ({
			id: wish.id,
			links: wish.shopLinks.map((link) => link.id),
		}));

	test("removes the wish with its last shop link", async () => {
		// Given
		const { h, alice } = await aliceWithLink();
		// When
		const deleted = await shopLinkActions.delete.run(alice, { id: LINK_ID });
		// Then
		expect({
			deleted,
			wishes: await listed(alice),
			links: h.accountRows(ALICE.id).shop_link ?? 0,
		}).toEqual({
			deleted: { ok: true, value: LINK_ID as ShopLinkId },
			wishes: [],
			links: 0,
		});
	});

	test("keeps the wish when another shop link stays", async () => {
		// Given: plus a second link on the wish
		const { alice } = await aliceWithLink();
		await addLink(alice, FIRST_ID, { ...zaraLink(null), id: OTHER_LINK_ID });
		// When
		await shopLinkActions.delete.run(alice, { id: LINK_ID });
		// Then
		expect(await held(alice)).toEqual([
			{ id: FIRST_ID, links: [OTHER_LINK_ID] },
		]);
	});

	test("keeps a wish added with no shop link when another wish's last link goes", async () => {
		// Given: plus a White short tee wish added with no link
		const { alice, ids } = await aliceWithLink();
		await wishActions.addToWishlist.run(alice, {
			id: SECOND_ID,
			typeId: "tee_s",
			colourId: ids.White,
		});
		// When
		await shopLinkActions.delete.run(alice, { id: LINK_ID });
		// Then
		expect((await listed(alice)).map((wish) => wish.id as string)).toEqual([
			SECOND_ID,
		]);
	});

	test("keeps the wish when a link joins it during its last link's delete", async () => {
		// Given: the delete read the wish, and its batch waits
		const { h, alice, ids } = await aliceWithLink();
		const hold = h.holdBatches();
		const deleting = shopLinkActions.delete.run(alice, { id: LINK_ID });
		await hold.queued(1);
		// When: a link with no pictures joins the wish, with no batch
		await wishActions.addToWishlist.run(alice, {
			...jacket(ids),
			id: SECOND_ID,
			shopLink: { ...zaraLink(null), id: OTHER_LINK_ID },
		});
		hold.release();
		await deleting;
		// Then
		expect(await held(alice)).toEqual([
			{ id: FIRST_ID, links: [OTHER_LINK_ID] },
		]);
	});
});

describe("shop link adds at once", () => {
	test("refuses one of two shop link adds that overlap at 9 links", async () => {
		// Given: alice's wish with 9 links; two adds of other links
		const { h, alice, ids } = await withAlice();
		await wishActions.add.run(alice, jacket(ids));
		await h.seedShopLinks(ALICE.id, FIRST_ID, 9);
		// When
		const results = await Promise.all([
			addLink(alice, FIRST_ID, zaraLink(null)),
			addLink(alice, FIRST_ID, { ...zaraLink(null), id: OTHER_LINK_ID }),
		]);
		// Then
		expect({
			count: (await linksOf(alice))?.length,
			oks: results.map((r) => r.ok).sort(),
			refused: results.flatMap((r) => (r.ok ? [] : [r.error])),
		}).toEqual({
			count: 10,
			oks: [false, true],
			refused: [SHOP_LINK_LIMIT_ROW],
		});
	});

	test("adds no shop link to a wish removed during the add", async () => {
		// Given: alice's wish with no link; a trigger deletes the wish just
		// before the link is written, after the add's wish check passed
		const { h, alice, ids } = await withAlice();
		await wishActions.add.run(alice, jacket(ids));
		h.addTrigger(
			"CREATE TRIGGER drop_wish BEFORE INSERT ON shop_link BEGIN DELETE FROM wish WHERE id = NEW.wish_id; END",
		);
		// When
		const added = addLink(alice, FIRST_ID, zaraLink(null));
		// Then: the failed insert rolls back the trigger's delete with it, so
		// the wish stays and no link is left with no wish
		await expect(added).rejects.toThrow();
		expect({
			links: h.accountRows(ALICE.id).shop_link ?? 0,
			wishes: (await listed(alice)).length,
		}).toEqual({ links: 0, wishes: 1 });
	});
});

describe("shop link pictures", () => {
	// Alice with the wish FIRST_ID for a Navy wool jacket.
	async function aliceWithWish() {
		const { h, alice, ids } = await withAlice();
		await wishActions.add.run(alice, jacket(ids));
		return { h, alice, ids };
	}

	const change = (pictureIds?: string[]) => ({
		id: LINK_ID,
		url: ZARA_URL,
		brandId: null,
		name: "Wool blend jacket",
		price: 2990000,
		...(pictureIds === undefined ? {} : { pictureIds }),
	});

	test("adds a shop link with its pictures and lists them", async () => {
		// Given
		const { h, alice } = await aliceWithWish();
		const [a, b] = await uploads(alice, 2);
		// When
		const added = await addLink(alice, FIRST_ID, {
			...zaraLink(null),
			pictureIds: [a, b],
		});
		// Then
		expect({
			ok: added.ok,
			pictureIds: (await linksOf(alice))?.[0]?.pictureIds,
			keys: h.pictures.keys(),
		}).toEqual({ ok: true, pictureIds: [a, b], keys: [a, b].sort() });
	});

	test("refuses a shop link with 9 pictures", async () => {
		// Given
		const { alice } = await aliceWithWish();
		const nine = await uploads(alice, 9);
		// When
		const refused = await addLink(alice, FIRST_ID, {
			...zaraLink(null),
			pictureIds: nine,
		});
		// Then
		expect({ refused, links: await linksOf(alice) }).toEqual({
			refused: { ok: false, error: PICTURE_LIMIT_ROW },
			links: [],
		});
	});

	test("refuses a picture of another shop link in the list", async () => {
		// Given
		const { alice } = await aliceWithWish();
		const [a] = await uploads(alice, 1);
		await addLink(alice, FIRST_ID, { ...zaraLink(null), pictureIds: [a] });
		// When
		const refused = await addLink(alice, FIRST_ID, {
			...zaraLink(null),
			id: OTHER_LINK_ID,
			pictureIds: [a],
		});
		// Then
		expect({
			refused,
			pictureIds: (await linksOf(alice))?.map((l) => l.pictureIds),
		}).toEqual({
			refused: { ok: false, error: NOT_YOUR_PICTURE_ROW },
			pictureIds: [[a]],
		});
	});

	test("deletes a picture left out of a shop link's list", async () => {
		// Given
		const { h, alice } = await aliceWithWish();
		const [a, b] = await uploads(alice, 2);
		await addLink(alice, FIRST_ID, { ...zaraLink(null), pictureIds: [a, b] });
		// When
		const changed = await shopLinkActions.change.run(alice, change([b]));
		// Then
		expect({
			ok: changed.ok,
			pictureIds: changed.ok && changed.value.shopLinks[0]?.pictureIds,
			keys: h.pictures.keys(),
		}).toEqual({ ok: true, pictureIds: [b], keys: [b] });
	});

	test("ends with the same pictures when one change is sent twice", async () => {
		// Given
		const { h, alice } = await aliceWithWish();
		const [a, b, c] = await uploads(alice, 3);
		await addLink(alice, FIRST_ID, { ...zaraLink(null), pictureIds: [a, b] });
		// When
		const first = await shopLinkActions.change.run(alice, change([b, c]));
		const second = await shopLinkActions.change.run(alice, change([b, c]));
		// Then
		expect({
			oks: [first.ok, second.ok],
			pictureIds: (await linksOf(alice))?.[0]?.pictureIds,
			keys: h.pictures.keys(),
		}).toEqual({
			oks: [true, true],
			pictureIds: [b, c],
			keys: [b, c].sort(),
		});
	});

	test("keeps a shop link's pictures when a change leaves pictureIds out", async () => {
		// Given
		const { alice } = await aliceWithWish();
		const [a] = await uploads(alice, 1);
		await addLink(alice, FIRST_ID, { ...zaraLink(null), pictureIds: [a] });
		// When
		const changed = await shopLinkActions.change.run(alice, {
			...change(),
			price: 2490000,
		});
		// Then
		const [link] = (await linksOf(alice)) ?? [];
		expect({
			ok: changed.ok,
			price: link?.price,
			pictureIds: link?.pictureIds,
		}).toEqual({ ok: true, price: 2490000, pictureIds: [a] });
	});

	test("keeps a shop link's pictures when a change is refused", async () => {
		// Given: the link holds a and b; the change names a brand Alice lacks
		const { h, alice } = await aliceWithWish();
		const [a, b] = await uploads(alice, 2);
		await addLink(alice, FIRST_ID, { ...zaraLink(null), pictureIds: [a, b] });
		const NO_SUCH_BRAND = "55555555-5555-4555-8555-555555555555";
		// When
		const changed = await shopLinkActions.change.run(alice, {
			...change([]),
			brandId: NO_SUCH_BRAND,
		});
		// Then
		expect({
			changed,
			pictureIds: (await linksOf(alice))?.[0]?.pictureIds,
			keys: h.pictures.keys(),
		}).toEqual({
			changed: {
				ok: false,
				error: {
					code: "invalid",
					status: 400,
					body: { error: "invalid", field: "brandId" },
					text: "55555555-5555-4555-8555-555555555555 is not one of your brands. list_brands names them.",
				},
			},
			pictureIds: [a, b],
			keys: [a, b].sort(),
		});
	});

	test("attaches no picture when the link id lands on another wish during the add", async () => {
		// Given: a second wish; another tab adds the link to the first wish
		// just before this add's batch
		const { h, alice, ids } = await aliceWithWish();
		await wishActions.add.run(alice, {
			id: SECOND_ID,
			typeId: "tee_s",
			colourId: ids.Navy,
		});
		const [a, b] = await uploads(alice, 2);
		const { db } = h;
		const batch = db.batch;
		const otherTabFirst: typeof batch = async (items) => {
			db.batch = batch;
			await addLink(alice, FIRST_ID, { ...zaraLink(null), pictureIds: [a] });
			return batch(items);
		};
		db.batch = otherTabFirst;
		// When
		await addLink(alice, SECOND_ID, { ...zaraLink(null), pictureIds: [b] });
		// Then
		expect({
			links: (await listed(alice)).map((w) => ({
				id: w.id,
				pictureIds: w.shopLinks.map((l) => l.pictureIds),
			})),
			keys: h.pictures.keys(),
		}).toEqual({
			links: [
				{ id: SECOND_ID as WishId, pictureIds: [] },
				{ id: FIRST_ID as WishId, pictureIds: [[a]] },
			],
			keys: [a, b].sort(),
		});
	});

	test("keeps the first send's pictures when a resend with fewer lands second", async () => {
		// Given: the add with a, its batch queued before the resend reads the id
		const { h, alice } = await aliceWithWish();
		const [a] = await uploads(alice, 1);
		const hold = h.holdBatches();
		const first = addLink(alice, FIRST_ID, {
			...zaraLink(null),
			pictureIds: [a],
		});
		await hold.queued(1);
		// When: the same add sent again with no pictures
		const resend = addLink(alice, FIRST_ID, {
			...zaraLink(null),
			pictureIds: [],
		});
		await hold.queued(2);
		hold.release();
		const [, again] = await Promise.all([first, resend]);
		// Then
		expect({
			ok: again.ok,
			created: again.ok && again.value.created,
			pictureIds: (await linksOf(alice))?.[0]?.pictureIds,
			keys: h.pictures.keys(),
		}).toEqual({ ok: true, created: false, pictureIds: [a], keys: [a] });
	});

	test("attaches no picture from a resend that lands after a first send with none", async () => {
		// Given: the add with no pictures, its batch queued before the resend
		// reads the id
		const { h, alice } = await aliceWithWish();
		const [a] = await uploads(alice, 1);
		const hold = h.holdBatches();
		const first = addLink(alice, FIRST_ID, {
			...zaraLink(null),
			pictureIds: [],
		});
		await hold.queued(1);
		// When: the same add sent again with a
		const resend = addLink(alice, FIRST_ID, {
			...zaraLink(null),
			pictureIds: [a],
		});
		await hold.queued(2);
		hold.release();
		const [, again] = await Promise.all([first, resend]);
		// Then: the link holds no picture and the bucket still holds a, so a
		// stays a draft
		expect({
			ok: again.ok,
			created: again.ok && again.value.created,
			pictureIds: (await linksOf(alice))?.[0]?.pictureIds,
			keys: h.pictures.keys(),
		}).toEqual({ ok: true, created: false, pictureIds: [], keys: [a] });
	});

	test("keeps a shop link's pictures when its add is sent again with another list", async () => {
		// Given: the Zara link added with a
		const { h, alice } = await aliceWithWish();
		const [a, b] = await uploads(alice, 2);
		await addLink(alice, FIRST_ID, { ...zaraLink(null), pictureIds: [a] });
		// When
		const again = await addLink(alice, FIRST_ID, {
			...zaraLink(null),
			pictureIds: [b],
		});
		// Then
		expect({
			ok: again.ok,
			created: again.ok && again.value.created,
			pictureIds: (await linksOf(alice))?.[0]?.pictureIds,
			keys: h.pictures.keys(),
		}).toEqual({
			ok: true,
			created: false,
			pictureIds: [a],
			keys: [a, b].sort(),
		});
	});

	test("takes a picture through a change on a link with no write id", async () => {
		// Given: a link written before links had a write id
		const { h, alice } = await aliceWithWish();
		await h.seedShopLinks(ALICE.id, FIRST_ID, 1);
		const [a] = await uploads(alice, 1);
		// When
		const changed = await shopLinkActions.change.run(alice, {
			id: "00000000-0000-4000-b000-000000000001",
			url: "https://shop.example/1",
			brandId: null,
			name: "Link 1",
			price: 100000,
			pictureIds: [a],
		});
		// Then
		expect({
			ok: changed.ok,
			pictureIds: changed.ok && changed.value.shopLinks[0]?.pictureIds,
		}).toEqual({ ok: true, pictureIds: [a] });
	});

	// LINK_ID holds a and b, OTHER_LINK_ID holds c.
	async function twoLinksWithPictures() {
		const { h, alice, ids } = await aliceWithWish();
		const [a, b, c] = await uploads(alice, 3);
		await addLink(alice, FIRST_ID, { ...zaraLink(null), pictureIds: [a, b] });
		await addLink(alice, FIRST_ID, {
			...zaraLink(null),
			id: OTHER_LINK_ID,
			pictureIds: [c],
		});
		return { h, alice, ids, a, b, c };
	}

	test("deletes a shop link with its pictures, from the bucket too", async () => {
		// Given
		const { h, alice, a, c } = await twoLinksWithPictures();
		// When
		const deleted = await shopLinkActions.delete.run(alice, { id: LINK_ID });
		const loaded = await pictureActions.read.run(alice, { id: a });
		// Then
		expect({
			ok: deleted.ok,
			keys: h.pictures.keys(),
			loaded: loaded.ok ? 200 : loaded.error.status,
		}).toEqual({ ok: true, keys: [c], loaded: 404 });
	});

	test("deletes a wish with the pictures of its links, from the bucket too", async () => {
		// Given: plus an owned item holding d
		const { h, alice, ids } = await twoLinksWithPictures();
		const [d] = await uploads(alice, 1);
		await ownedItemActions.add.run(alice, {
			id: SECOND_ID,
			typeId: "shirt_l",
			colourId: ids.Navy,
			brandId: null,
			quantity: 1,
			pictureIds: [d],
		});
		// When
		const deleted = await wishActions.delete.run(alice, { id: FIRST_ID });
		// Then
		expect({ ok: deleted.ok, keys: h.pictures.keys() }).toEqual({
			ok: true,
			keys: [d],
		});
	});
});

// A COS brand, and three wishes, oldest first: a Navy sweater with a COS
// link, a Navy long tee with a link of no brand, Navy chino pants with no
// link.
async function filterWishes(alice: ActionScope, ids: Ids) {
	const cos = await addBrand(alice, "COS");
	const wishOf = async (typeId: string) => {
		const id = crypto.randomUUID();
		await wishActions.add.run(alice, { id, typeId, colourId: ids.Navy });
		return id;
	};
	const link = (brandId: string | null) => ({
		id: crypto.randomUUID(),
		url: "https://shop.example/a",
		brandId,
		name: "A piece",
	});
	await addLink(alice, await wishOf("sweater"), link(cos));
	await addLink(alice, await wishOf("tee_l"), link(null));
	await wishOf("chino_p");
	return cos;
}

describe("listing with a filter", () => {
	test("lists the wishes with a shop link of a picked brand", async () => {
		// Given: three wishes
		const { alice, ids } = await withAlice();
		const cos = await filterWishes(alice, ids);
		// When
		const wishes = await wishActions.list.run(alice, { brandIds: [cos] });
		// Then
		expect(held(wishes).map((w) => w.typeId)).toEqual(["sweater"]);
	});

	test("lists the wishes with a shop link with no brand for a null brand id", async () => {
		// Given: three wishes
		const { alice, ids } = await withAlice();
		await filterWishes(alice, ids);
		// When
		const wishes = await wishActions.list.run(alice, { brandIds: [null] });
		// Then
		expect(held(wishes).map((w) => w.typeId)).toEqual(["tee_l"]);
	});

	test("refuses an empty brand id in a filter", async () => {
		// Given: three wishes
		const { alice, ids } = await withAlice();
		await filterWishes(alice, ids);
		// When
		const wishes = await wishActions.list.run(alice, {
			brandIds: ["", "nope"],
		});
		// Then
		expect(wishes).toEqual({
			ok: false,
			error: {
				code: "not_brand",
				status: 400,
				body: { error: "invalid", field: "brandIds" },
				text: " is not one of your brands. list_brands names them.",
			},
		});
	});
});
