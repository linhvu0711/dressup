import { describe, expect, test } from "bun:test";
import {
	answer,
	BOB,
	bytes,
	colourIds,
	type Harness,
	JPEG,
	makeHarness,
	PDF,
	send,
	uploadPicture,
	withAccount,
} from "./test/harness";

const NO_SUCH_ID = "5b1f2c3d-0000-4000-8000-000000000000";

const upload = (h: Harness, headers: Headers, body: Uint8Array = JPEG) =>
	send(h, headers, "POST", "/api/pictures", body);

describe("upload and load", () => {
	test("uploads a JPEG and loads it back", async () => {
		// Given
		const { h, headers } = await withAccount();
		// When
		const uploaded = await upload(h, headers);
		const { picture: added } = (await uploaded.json()) as {
			picture: { id: string };
		};
		const loaded = await send(h, headers, "GET", `/api/pictures/${added.id}`);
		// Then
		expect({
			uploaded: uploaded.status,
			loaded: loaded.status,
			type: loaded.headers.get("content-type"),
			cache: loaded.headers.get("cache-control"),
			body: new Uint8Array(await loaded.arrayBuffer()),
			keys: h.pictures.keys(),
		}).toEqual({
			uploaded: 201,
			loaded: 200,
			type: "image/jpeg",
			cache: "private, max-age=31536000, immutable",
			body: JPEG,
			keys: [added.id],
		});
	});

	test("refuses a body that is not a picture under an image header", async () => {
		// Given
		const { h, headers } = await withAccount();
		// When
		const refused = await answer(await upload(h, headers, PDF));
		// Then
		expect({ ...refused, keys: h.pictures.keys() }).toEqual({
			status: 400,
			body: { error: "invalid", field: "body" },
			keys: [],
		});
	});

	test("takes a body of exactly 1,048,576 bytes", async () => {
		// Given
		const { h, headers } = await withAccount();
		// When
		const uploaded = await upload(
			h,
			headers,
			bytes([0xff, 0xd8, 0xff, 0xe0], 1_048_576),
		);
		// Then
		expect(uploaded.status).toBe(201);
	});

	test("refuses a body over 1,048,576 bytes", async () => {
		// Given
		const { h, headers } = await withAccount();
		// When
		const refused = await answer(
			await upload(h, headers, bytes([0xff, 0xd8, 0xff, 0xe0], 1_048_577)),
		);
		// Then
		expect({ ...refused, keys: h.pictures.keys() }).toEqual({
			status: 413,
			body: { error: "too_large" },
			keys: [],
		});
	});

	test("answers 404 for a picture of another account", async () => {
		// Given
		const { h, headers } = await withAccount();
		const bob = await h.addAccount(BOB);
		const bobs = await uploadPicture(h, bob);
		// When
		const asAlice = await answer(
			await send(h, headers, "GET", `/api/pictures/${bobs}`),
		);
		const asBob = await send(h, bob, "GET", `/api/pictures/${bobs}`);
		// Then
		expect({ alice: asAlice, bob: asBob.status }).toEqual({
			alice: { status: 404, body: { error: "not_found" } },
			bob: 200,
		});
	});

	test("answers 401 without a session", async () => {
		// Given
		const h = await makeHarness();
		const none = new Headers();
		// When
		const uploaded = await answer(await upload(h, none));
		const loaded = await answer(
			await send(h, none, "GET", `/api/pictures/${NO_SUCH_ID}`),
		);
		// Then
		expect([uploaded, loaded]).toEqual([
			{ status: 401, body: { error: "unauthorized" } },
			{ status: 401, body: { error: "unauthorized" } },
		]);
	});

	test("answers 401 to a signed-out draft delete", async () => {
		// Given: no session headers
		const h = await makeHarness();
		// When
		const res = await send(
			h,
			new Headers(),
			"DELETE",
			`/api/pictures/${NO_SUCH_ID}`,
		);
		// Then
		expect(await answer(res)).toEqual({
			status: 401,
			body: { error: "unauthorized" },
		});
	});

	test("answers not_stored as JSON when the bucket refuses the upload", async () => {
		// Given
		const { h, headers } = await withAccount();
		h.pictures.failPuts = true;
		// When
		const res = await upload(h, headers);
		// Then
		expect({ status: res.status, text: await res.text() }).toEqual({
			status: 500,
			text: '{"error":"not_stored"}',
		});
	});
});

// An owned item with these pictures: a Navy long button-up, no brand.
async function addItem(h: Harness, headers: Headers, pictureIds: string[]) {
	const navy = (await colourIds(h, headers)).Navy;
	const id = crypto.randomUUID();
	await send(h, headers, "POST", "/api/owned-items", {
		id,
		typeId: "shirt_l",
		colourId: navy,
		brandId: null,
		quantity: 1,
		pictureIds,
	});
	return id;
}

describe("drafts", () => {
	test("deletes a draft picture", async () => {
		// Given
		const { h, headers } = await withAccount();
		const a = await uploadPicture(h, headers);
		// When
		const deleted = await send(h, headers, "DELETE", `/api/pictures/${a}`);
		const loaded = await send(h, headers, "GET", `/api/pictures/${a}`);
		// Then
		expect({
			deleted: deleted.status,
			loaded: loaded.status,
			keys: h.pictures.keys(),
		}).toEqual({ deleted: 204, loaded: 404, keys: [] });
	});

	test("keeps a saved picture on a draft delete", async () => {
		// Given
		const { h, headers } = await withAccount();
		const a = await uploadPicture(h, headers);
		await addItem(h, headers, [a]);
		// When
		const refused = await answer(
			await send(h, headers, "DELETE", `/api/pictures/${a}`),
		);
		const loaded = await send(h, headers, "GET", `/api/pictures/${a}`);
		// Then
		expect({ refused, loaded: loaded.status }).toEqual({
			refused: { status: 404, body: { error: "not_found" } },
			loaded: 200,
		});
	});
});

describe("deletes and the stored bytes", () => {
	test("leaves no object when the account goes during an upload", async () => {
		// Given: the account is deleted while the upload puts its object
		const { h, headers } = await withAccount();
		const bucket = h.pictures;
		bucket.beforePut = async () => {
			bucket.beforePut = undefined;
			await send(h, headers, "DELETE", "/api/account");
		};
		// When
		const refused = await answer(await upload(h, headers));
		// Then
		expect({ ...refused, keys: h.pictures.keys() }).toEqual({
			status: 404,
			body: { error: "not_found" },
			keys: [],
		});
	});
});
