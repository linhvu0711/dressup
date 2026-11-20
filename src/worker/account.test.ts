import { describe, expect, test } from "bun:test";
import {
	googleSignIn,
	googleUser,
	type Harness,
	type Jar,
	makeHarness,
	send,
	store,
	stubOutside,
	uploadPicture,
	withAiSession,
} from "./test/harness";

const deleteAccount = (h: Harness, jar: Jar) =>
	send(h, jar, "DELETE", "/api/account");

const me = async (h: Harness, jar: Jar) => {
	const res = await send(h, jar, "GET", "/api/me");
	return { status: res.status, body: await res.json() };
};

// The account's colours, brands, mannequin, one tag, one combination with
// that tag, one owned item with one picture, one draft picture, and one wish
// with one shop link, through the routes.
async function fillAccount(
	h: Harness,
	jar: Jar,
	combinationId = "33333333-3333-4333-8333-333333333333",
	ownedItemId = "44444444-4444-4444-8444-444444444444",
	wishId = "66666666-6666-4666-8666-666666666666",
	shopLinkId = "77777777-7777-4777-8777-777777777777",
) {
	const listed = await send(h, jar, "GET", "/api/colours");
	expect(listed.status).toBe(200);
	const { colours } = (await listed.json()) as {
		colours: { id: string; name: string }[];
	};
	const idOf = (name: string) => colours.find((c) => c.name === name)?.id;
	const skin = await send(h, jar, "PUT", "/api/mannequin/skin", {
		hex: "#8D5524",
	});
	expect(skin.status).toBe(200);
	const brand = { name: "Uniqlo" };
	const brandAdded = await send(h, jar, "POST", "/api/brands", brand);
	expect(brandAdded.status).toBe(201);
	const uniqlo = ((await brandAdded.json()) as { brand: { id: string } }).brand
		.id;
	const added = await send(h, jar, "POST", "/api/tags", { name: "Work" });
	const { tag } = (await added.json()) as { tag: { id: string } };
	const combination = {
		id: combinationId,
		pieces: [
			{ typeId: "casual_p", colourId: idOf("Navy") },
			{ typeId: "tee_l", colourId: idOf("White") },
		],
		tags: [tag.id],
	};
	expect(
		(await send(h, jar, "POST", "/api/combinations", combination)).status,
	).toBe(201);
	const saved = await uploadPicture(h, jar);
	await uploadPicture(h, jar);
	const ownedItem = {
		id: ownedItemId,
		typeId: "casual_p",
		colourId: idOf("Navy"),
		brandId: null,
		quantity: 1,
		pictureIds: [saved],
	};
	expect(
		(await send(h, jar, "POST", "/api/owned-items", ownedItem)).status,
	).toBe(201);
	const wish = { id: wishId, typeId: "casual_p", colourId: idOf("Navy") };
	expect((await send(h, jar, "POST", "/api/wishes", wish)).status).toBe(201);
	const shopLink = {
		id: shopLinkId,
		url: "https://www.uniqlo.com/vn/en/casual-pants",
		brandId: uniqlo,
		name: "Casual pants",
		price: 588000,
	};
	expect(
		(await send(h, jar, "POST", `/api/wishes/${wishId}/shop-links`, shopLink))
			.status,
	).toBe(201);
}

// The tables that still hold rows of the account, as [table, count].
const left = (h: Harness, userId: string) =>
	Object.entries(h.accountRows(userId)).filter(([, n]) => n > 0);

describe("DELETE /api/account", () => {
	async function aliceWithRows() {
		const h = await makeHarness();
		stubOutside();
		const jar = (await googleSignIn(h)).jar;
		const { body } = await me(h, jar);
		const aliceId = (body as { id: string }).id;
		await fillAccount(h, jar);
		return { h, jar, aliceId };
	}

	test("deletes the account and every row of it", async () => {
		// Given: alice connected an AI app through Google and took one AI action,
		// then saved colours, a skin colour, and one combination
		const { h, ai, userId } = await withAiSession();
		await ai.call("list_tags");
		await fillAccount(h, ai.jar);
		// When
		const res = await deleteAccount(h, ai.jar);
		// Then: no table that points at user keeps a row of hers, and every such
		// key deletes with the user, so a new table with no rows is caught too
		const rules = Object.entries(h.userForeignKeys()).filter(
			([, rule]) => rule !== "CASCADE",
		);
		expect({
			status: res.status,
			left: left(h, userId),
			rules,
			objects: h.pictures.keys(),
		}).toEqual({
			status: 204,
			left: [],
			rules: [],
			objects: [],
		});
	});

	test("signs the browser out with the delete", async () => {
		// Given: alice signed in through Google; /api/me answered once, so the
		// cookie cache is set
		const { h, jar } = await aliceWithRows();
		expect((await me(h, jar)).status).toBe(200);
		// When
		const res = await deleteAccount(h, jar);
		const after = await me(h, store(jar, res));
		// Then
		expect(after).toEqual({ status: 401, body: { error: "unauthorized" } });
	});

	test("leaves every row of the other account", async () => {
		// Given: alice and bob signed in through Google, each with rows
		const { h, jar: alice } = await aliceWithRows();
		stubOutside({ google: googleUser("bob") });
		const bob = (await googleSignIn(h)).jar;
		const bobId = ((await me(h, bob)).body as { id: string }).id;
		await fillAccount(
			h,
			bob,
			"44444444-4444-4444-8444-444444444444",
			"55555555-5555-4555-8555-555555555555",
			"88888888-8888-4888-8888-888888888888",
			"99999999-9999-4999-8999-999999999999",
		);
		const bobBefore = h.accountRows(bobId);
		// When
		await deleteAccount(h, alice);
		// Then
		const bobMe = await me(h, bob);
		expect({
			rows: h.accountRows(bobId),
			filled: Object.values(bobBefore).filter((n) => n > 0).length,
			me: {
				status: bobMe.status,
				email: (bobMe.body as { email: string }).email,
			},
		}).toEqual({
			rows: bobBefore,
			filled: 15,
			me: { status: 200, email: "bob@example.com" },
		});
	});

	test("keeps the account and the session when the delete fails", async () => {
		// Given: alice with rows; the user row cannot be deleted
		const { h, jar, aliceId } = await aliceWithRows();
		const before = h.accountRows(aliceId);
		h.addTrigger(
			"CREATE TRIGGER no_delete BEFORE DELETE ON user BEGIN SELECT RAISE(ABORT, 'no delete'); END",
		);
		// When
		const res = await deleteAccount(h, jar);
		// Then
		const after = await me(h, jar);
		expect({
			status: res.status,
			rows: h.accountRows(aliceId),
			me: {
				status: after.status,
				email: (after.body as { email: string }).email,
			},
		}).toEqual({
			status: 500,
			rows: before,
			me: { status: 200, email: "alice@example.com" },
		});
	});

	test("ends in the same state when the delete comes twice", async () => {
		// Given: alice with rows, deleted once with these cookies
		const { h, jar, aliceId } = await aliceWithRows();
		expect((await deleteAccount(h, jar)).status).toBe(204);
		// When: the same old cookies, whose cache cookie still lets them in
		const res = await deleteAccount(h, jar);
		// Then
		expect({ status: res.status, left: left(h, aliceId) }).toEqual({
			status: 204,
			left: [],
		});
	});

	test("makes a new empty account on the next Google sign-in", async () => {
		// Given: alice's first sign-in, then rows, then the delete
		const h = await makeHarness();
		stubOutside();
		const first = (await googleSignIn(h)).jar;
		const firstId = ((await me(h, first)).body as { id: string }).id;
		await fillAccount(h, first);
		expect((await deleteAccount(h, first)).status).toBe(204);
		// When
		const again = (await googleSignIn(h)).jar;
		// Then
		const now = (await me(h, again)).body as { id: string; email: string };
		expect({
			email: now.email,
			newId: now.id !== firstId,
			mannequin: await (await send(h, again, "GET", "/api/mannequin")).json(),
		}).toEqual({
			email: "alice@example.com",
			newId: true,
			mannequin: { mannequin: { skin: "#D6A27B", hair: "#141418" } },
		});
	});

	test("refuses DELETE /api/account without a session", async () => {
		// Given: alice signed in through Google; no cookie on the request
		const { h, aliceId } = await aliceWithRows();
		// When
		const res = await deleteAccount(h, new Map());
		// Then
		expect({
			status: res.status,
			body: await res.json(),
			users: h.accountRows(aliceId).user,
		}).toEqual({
			status: 401,
			body: { error: "unauthorized" },
			users: 1,
		});
	});
});
