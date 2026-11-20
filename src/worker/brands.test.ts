import { describe, expect, test } from "bun:test";
import { addBrand } from "./brand-store";
import {
	BOB,
	colourIds,
	type Harness,
	postBrand,
	postBrands,
	send,
	withAccount,
} from "./test/harness";

type Brand = { id: string; name: string };

const brandsOf = async (h: Harness, headers: Headers) =>
	(
		(await (await send(h, headers, "GET", "/api/brands")).json()) as {
			brands: Brand[];
		}
	).brands;

const namesOf = async (h: Harness, headers: Headers) =>
	(await brandsOf(h, headers)).map((b) => b.name);

const post = (h: Harness, headers: Headers, name: string) =>
	send(h, headers, "POST", "/api/brands", { name });

const putBrand = (h: Harness, headers: Headers, id: string, name: string) =>
	send(h, headers, "PUT", `/api/brands/${id}`, { id, name });

describe("GET /api/brands", () => {
	test("lists no brands for a new account", async () => {
		// Given: alice signed in
		const { h, headers } = await withAccount();
		// When
		const res = await send(h, headers, "GET", "/api/brands");
		// Then
		expect({ status: res.status, body: await res.json() }).toEqual({
			status: 200,
			body: { brands: [] },
		});
	});

	test("lists the brands A to Z", async () => {
		// Given: alice adds Zara, then acne, then COS
		const { h, headers } = await withAccount();
		for (const name of ["Zara", "acne", "COS"])
			expect((await post(h, headers, name)).status).toBe(201);
		// When
		const names = await namesOf(h, headers);
		// Then
		expect(names).toEqual(["acne", "COS", "Zara"]);
	});

	test("answers 401 to a signed-out request", async () => {
		// Given: alice, no session headers
		const { h } = await withAccount();
		// When
		const list = await send(h, new Headers(), "GET", "/api/brands");
		const add = await post(h, new Headers(), "Zara");
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

describe("POST /api/brands", () => {
	test("adds a brand", async () => {
		// Given: alice with no brands
		const { h, headers } = await withAccount();
		// When
		const res = await post(h, headers, "  Uniqlo  ");
		// Then
		expect({
			status: res.status,
			name: ((await res.json()) as { brand: Brand }).brand.name,
			names: await namesOf(h, headers),
		}).toEqual({ status: 201, name: "Uniqlo", names: ["Uniqlo"] });
	});

	test("refuses a name the account has in another case", async () => {
		// Given: alice with the brand Zara
		const { h, headers } = await withAccount();
		await post(h, headers, "Zara");
		// When
		const res = await post(h, headers, "zara");
		// Then
		expect({
			status: res.status,
			body: await res.json(),
			names: await namesOf(h, headers),
		}).toEqual({
			status: 409,
			body: { error: "duplicate", field: "name" },
			names: ["Zara"],
		});
	});

	test("refuses an empty name", async () => {
		// Given: alice with no brands
		const { h, headers } = await withAccount();
		// When
		const res = await post(h, headers, "   ");
		// Then
		expect({ status: res.status, body: await res.json() }).toEqual({
			status: 400,
			body: { error: "invalid", field: "name" },
		});
	});

	test("refuses a 25-character name", async () => {
		// Given: alice with no brands
		const { h, headers } = await withAccount();
		// When
		const res = await post(h, headers, "B".repeat(25));
		// Then
		expect({ status: res.status, body: await res.json() }).toEqual({
			status: 400,
			body: { error: "invalid", field: "name" },
		});
	});

	test("adds brand number 100", async () => {
		// Given: alice with 99 brands
		const { h, headers } = await withAccount();
		await postBrands(h, headers, 99);
		// When
		const res = await post(h, headers, "Uniqlo");
		// Then
		expect({
			status: res.status,
			count: (await brandsOf(h, headers)).length,
		}).toEqual({ status: 201, count: 100 });
	});

	test("refuses brand number 101", async () => {
		// Given: alice with 100 brands
		const { h, headers } = await withAccount();
		await postBrands(h, headers, 100);
		// When
		const res = await post(h, headers, "Uniqlo");
		// Then
		expect({
			status: res.status,
			body: await res.json(),
			count: (await brandsOf(h, headers)).length,
		}).toEqual({ status: 409, body: { error: "brand_limit" }, count: 100 });
	});
});

// Another tab's save of the same name, written by a trigger just before this
// request's own write, after its duplicate check has passed.
const otherTabWrites = (h: Harness, when: "INSERT" | "UPDATE", name: string) =>
	h.addTrigger(
		`CREATE TRIGGER other_tab BEFORE ${when} ON brand WHEN NEW.name = '${name}'
		BEGIN
			INSERT INTO brand (id, user_id, name, created_at)
			VALUES ('other-tab', NEW.user_id, lower(NEW.name), 0);
		END`,
	);

describe("two writes at the same time", () => {
	test("answers duplicate when another tab adds the name first", async () => {
		// Given: alice with no brands; another tab stores "zara" between this
		// add's check and its write
		const { h, headers } = await withAccount();
		otherTabWrites(h, "INSERT", "Zara");
		// When
		const res = await post(h, headers, "Zara");
		// Then
		expect({ status: res.status, body: await res.json() }).toEqual({
			status: 409,
			body: { error: "duplicate", field: "name" },
		});
	});

	test("adds one of two brands sent at once at 99", async () => {
		// Given: alice with 99 brands
		const { h, headers } = await withAccount();
		await postBrands(h, headers, 99);
		// When
		const results = await Promise.all([
			addBrand(h.db, "alice-id", "Uniqlo"),
			addBrand(h.db, "alice-id", "Muji"),
		]);
		// Then
		expect({
			oks: results.map((r) => r.ok).sort(),
			refused: results.flatMap((r) => (r.ok ? [] : [r.error])),
			count: (await brandsOf(h, headers)).length,
		}).toEqual({
			oks: [false, true],
			refused: [{ code: "brand_limit" }],
			count: 100,
		});
	});
});

describe("PUT and DELETE /api/brands/:id", () => {
	test("renames a brand", async () => {
		// Given: alice with the brand Zara
		const { h, headers } = await withAccount();
		const id = await postBrand(h, headers, "Zara");
		// When
		const res = await putBrand(h, headers, id, "Zara Home");
		// Then
		expect({
			status: res.status,
			name: ((await res.json()) as { brand: Brand }).brand.name,
			names: await namesOf(h, headers),
		}).toEqual({ status: 200, name: "Zara Home", names: ["Zara Home"] });
	});

	test("renames a brand to its own name in another case", async () => {
		// Given: alice with the brand Zara
		const { h, headers } = await withAccount();
		const id = await postBrand(h, headers, "Zara");
		// When
		const res = await putBrand(h, headers, id, "ZARA");
		// Then
		expect({ status: res.status, names: await namesOf(h, headers) }).toEqual({
			status: 200,
			names: ["ZARA"],
		});
	});

	test("refuses a rename to another brand's name", async () => {
		// Given: alice with Zara and COS
		const { h, headers } = await withAccount();
		await post(h, headers, "Zara");
		const cos = await postBrand(h, headers, "COS");
		// When
		const res = await putBrand(h, headers, cos, "zara");
		// Then
		expect({
			status: res.status,
			body: await res.json(),
			names: await namesOf(h, headers),
		}).toEqual({
			status: 409,
			body: { error: "duplicate", field: "name" },
			names: ["COS", "Zara"],
		});
	});

	test("answers not found for another account's brand", async () => {
		// Given: bob with the brand Zara; alice signed in
		const { h, headers } = await withAccount();
		const bob = await h.addAccount(BOB);
		const id = await postBrand(h, bob, "Zara");
		// When
		const put = await putBrand(h, headers, id, "Mine");
		const del = await send(h, headers, "DELETE", `/api/brands/${id}`);
		// Then
		expect({
			put: put.status,
			delete: del.status,
			bobNames: await namesOf(h, bob),
		}).toEqual({ put: 404, delete: 404, bobNames: ["Zara"] });
	});

	test("deletes a brand", async () => {
		// Given: alice with Zara and COS
		const { h, headers } = await withAccount();
		const id = await postBrand(h, headers, "Zara");
		await post(h, headers, "COS");
		// When
		const first = await send(h, headers, "DELETE", `/api/brands/${id}`);
		const second = await send(h, headers, "DELETE", `/api/brands/${id}`);
		// Then
		expect({
			first: first.status,
			second: second.status,
			names: await namesOf(h, headers),
		}).toEqual({ first: 204, second: 404, names: ["COS"] });
	});

	test("answers duplicate when another tab saves the name during a rename", async () => {
		// Given: alice with COS; another tab stores "zara" between this
		// rename's check and its write
		const { h, headers } = await withAccount();
		const cos = await postBrand(h, headers, "COS");
		otherTabWrites(h, "UPDATE", "Zara");
		// When
		const res = await putBrand(h, headers, cos, "Zara");
		// Then
		expect({ status: res.status, body: await res.json() }).toEqual({
			status: 409,
			body: { error: "duplicate", field: "name" },
		});
	});

	test("answers 401 to a signed-out rename and delete", async () => {
		// Given: alice, no session headers
		const { h } = await withAccount();
		const id = "6f1c2b9e-1d2a-4c3b-9e8f-0a1b2c3d4e5f";
		// When
		const put = await putBrand(h, new Headers(), id, "Zara");
		const del = await send(h, new Headers(), "DELETE", `/api/brands/${id}`);
		// Then
		expect([
			{ status: put.status, body: await put.json() },
			{ status: del.status, body: await del.json() },
		]).toEqual([
			{ status: 401, body: { error: "unauthorized" } },
			{ status: 401, body: { error: "unauthorized" } },
		]);
	});
});

describe("owned items of a deleted brand", () => {
	type Item = { id: string; typeId: string; brand: Brand | null };

	const navyId = async (h: Harness, headers: Headers) =>
		(await colourIds(h, headers)).Navy;

	const addShirt = async (
		h: Harness,
		headers: Headers,
		id: string,
		brandId: string,
	) =>
		send(h, headers, "POST", "/api/owned-items", {
			id,
			typeId: "shirt_l",
			colourId: await navyId(h, headers),
			brandId,
			quantity: 1,
		});

	const items = async (h: Harness, headers: Headers) =>
		(
			(await (await send(h, headers, "GET", "/api/owned-items")).json()) as {
				ownedItems: Item[];
			}
		).ownedItems;

	test("counts the owned items of each brand", async () => {
		// Given: alice with Zara and COS; a Navy long button-up, a White short
		// tee, and a Black long tee, each from Zara
		const { h, headers } = await withAccount();
		const zara = await postBrand(h, headers, "Zara");
		await postBrand(h, headers, "COS");
		const ids = await colourIds(h, headers);
		const colourId = (name: string) => ids[name];
		const pieces = [
			["11111111-1111-4111-8111-111111111111", "shirt_l", "Navy"],
			["22222222-2222-4222-8222-222222222222", "tee_s", "White"],
			["33333333-3333-4333-8333-333333333333", "tee_l", "Black"],
		];
		for (const [id, typeId, colour] of pieces)
			await send(h, headers, "POST", "/api/owned-items", {
				id,
				typeId,
				colourId: colourId(colour),
				brandId: zara,
				quantity: 1,
			});
		// When
		const res = await send(h, headers, "GET", "/api/brands");
		// Then
		const { brands } = (await res.json()) as {
			brands: { name: string; items: number }[];
		};
		expect(brands.map((b) => [b.name, b.items])).toEqual([
			["COS", 0],
			["Zara", 3],
		]);
	});

	test("clears the brand of its items when the brand goes", async () => {
		// Given: alice with Zara and a Navy long button-up from Zara
		const { h, headers } = await withAccount();
		const zara = await postBrand(h, headers, "Zara");
		await addShirt(h, headers, "11111111-1111-4111-8111-111111111111", zara);
		// When
		await send(h, headers, "DELETE", `/api/brands/${zara}`);
		// Then
		expect((await items(h, headers))[0].brand).toBeNull();
	});

	test("keeps two items of one piece when both lose their brand", async () => {
		// Given: alice with Zara and COS, a Navy long button-up from each
		const { h, headers } = await withAccount();
		const zara = await postBrand(h, headers, "Zara");
		const cos = await postBrand(h, headers, "COS");
		await addShirt(h, headers, "11111111-1111-4111-8111-111111111111", zara);
		await addShirt(h, headers, "22222222-2222-4222-8222-222222222222", cos);
		// When
		await send(h, headers, "DELETE", `/api/brands/${zara}`);
		await send(h, headers, "DELETE", `/api/brands/${cos}`);
		// Then
		expect(
			(await items(h, headers)).map((i) => ({
				typeId: i.typeId,
				brand: i.brand,
			})),
		).toEqual([
			{ typeId: "shirt_l", brand: null },
			{ typeId: "shirt_l", brand: null },
		]);
	});
});

describe("brands of shop links", () => {
	const WISH_ID = "11111111-1111-4111-8111-111111111111";

	// Alice with Zara and a wish for a Navy wool jacket.
	async function aliceWithWish() {
		const { h, headers } = await withAccount();
		const zara = await postBrand(h, headers, "Zara");
		const navy = (await colourIds(h, headers)).Navy;
		await send(h, headers, "POST", "/api/wishes", {
			id: WISH_ID,
			typeId: "wool",
			colourId: navy,
		});
		return { h, headers, zara, navy };
	}

	const addLink = (h: Harness, headers: Headers, id: string, brandId: string) =>
		send(h, headers, "POST", `/api/wishes/${WISH_ID}/shop-links`, {
			id,
			url: "https://www.zara.com/vn/en/wool-blend-jacket.html",
			brandId,
			name: "Wool blend jacket",
			price: 2990000,
		});

	test("counts the shop links of each brand", async () => {
		// Given: alice with Zara on 2 shop links of one wish and on 1 owned item
		const { h, headers, zara, navy } = await aliceWithWish();
		await addLink(h, headers, "33333333-3333-4333-8333-333333333333", zara);
		await addLink(h, headers, "44444444-4444-4444-8444-444444444444", zara);
		await send(h, headers, "POST", "/api/owned-items", {
			id: "22222222-2222-4222-8222-222222222222",
			typeId: "shirt_l",
			colourId: navy,
			brandId: zara,
			quantity: 1,
		});
		// When
		const res = await send(h, headers, "GET", "/api/brands");
		// Then
		const { brands } = (await res.json()) as {
			brands: { name: string; items: number; shopLinks: number }[];
		};
		expect(brands.map((b) => [b.name, b.items, b.shopLinks])).toEqual([
			["Zara", 1, 2],
		]);
	});

	test("clears the brand of its shop links when the brand goes", async () => {
		// Given: alice with Zara on 1 shop link
		const { h, headers, zara } = await aliceWithWish();
		await addLink(h, headers, "33333333-3333-4333-8333-333333333333", zara);
		// When
		await send(h, headers, "DELETE", `/api/brands/${zara}`);
		// Then
		const { wishes } = (await (
			await send(h, headers, "GET", "/api/wishes")
		).json()) as { wishes: { shopLinks: { brand: unknown }[] }[] };
		expect(wishes[0]?.shopLinks[0]?.brand).toBeNull();
	});
});
