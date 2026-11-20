import { afterEach, describe, expect, setSystemTime, test } from "bun:test";
import { picture, pictureUploadMonth } from "./db/picture-schema";
import { addPicture } from "./picture-store";
import {
	answer,
	BOB,
	bytes,
	colourIds,
	type Harness,
	JPEG,
	makeHarness,
	PDF,
	PNG,
	send,
	uploadPicture,
	withAccount,
} from "./test/harness";

const WEBP = bytes(
	[0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50],
	100,
);

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

	test("uploads a PNG and a WebP", async () => {
		// Given
		const { h, headers } = await withAccount();
		// When
		const statuses = [];
		const types = [];
		for (const body of [PNG, WEBP]) {
			const uploaded = await upload(h, headers, body);
			statuses.push(uploaded.status);
			const { picture: added } = (await uploaded.json()) as {
				picture: { id: string };
			};
			const loaded = await send(h, headers, "GET", `/api/pictures/${added.id}`);
			types.push(loaded.headers.get("content-type"));
		}
		// Then
		expect({ statuses, types }).toEqual({
			statuses: [201, 201],
			types: ["image/png", "image/webp"],
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

	test("answers 404 for an id no picture has", async () => {
		// Given
		const { h, headers } = await withAccount();
		await upload(h, headers);
		// When
		const missing = await answer(
			await send(h, headers, "GET", `/api/pictures/${NO_SUCH_ID}`),
		);
		const notAnId = await answer(
			await send(h, headers, "GET", "/api/pictures/nope"),
		);
		// Then
		expect([missing, notAnId]).toEqual([
			{ status: 404, body: { error: "not_found" } },
			{ status: 404, body: { error: "not_found" } },
		]);
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

	test("removes the row when the bucket refuses the upload", async () => {
		// Given
		const { h, headers } = await withAccount();
		h.pictures.failPuts = true;
		// When
		const uploaded = await upload(h, headers);
		// Then
		expect({ status: uploaded.status, rows: await h.rows(picture) }).toEqual({
			status: 500,
			rows: [],
		});
	});

	test("takes back the month's count when the bucket refuses the upload", async () => {
		// Given
		const { h, headers } = await withAccount();
		await upload(h, headers);
		h.pictures.failPuts = true;
		// When
		await upload(h, headers);
		// Then
		expect(await h.rows(pictureUploadMonth)).toEqual([
			{ month: new Date().toISOString().slice(0, 7), count: 1 },
		]);
	});
});

describe("limits and the storage stop", () => {
	afterEach(() => setSystemTime());

	const months = (h: Harness) => h.rows(pictureUploadMonth);

	test("takes picture 1,000 of an account", async () => {
		// Given
		const { h, headers } = await withAccount();
		await h.seedPictures("alice-id", 999);
		// When
		const uploaded = await upload(h, headers);
		// Then
		expect(uploaded.status).toBe(201);
	});

	test("refuses picture 1,001 of an account", async () => {
		// Given
		const { h, headers } = await withAccount();
		await h.seedPictures("alice-id", 1000);
		// When
		const refused = await answer(await upload(h, headers));
		// Then
		expect({ ...refused, keys: h.pictures.keys() }).toEqual({
			status: 409,
			body: { error: "account_picture_limit" },
			keys: [],
		});
	});

	test("refuses picture 1,001 when one is on a shop link", async () => {
		// Given
		const { h, headers } = await withAccount();
		await h.seedPictures("alice-id", 999);
		await addLinks(h, headers, [[await uploadPicture(h, headers)]]);
		// When
		const refused = await answer(await upload(h, headers));
		// Then
		expect(refused).toEqual({
			status: 409,
			body: { error: "account_picture_limit" },
		});
	});

	test("stops uploads when all pictures reach 9 GB", async () => {
		// Given
		const { h, headers } = await withAccount();
		await h.addAccount(BOB);
		await h.seedPictures("bob-id", 1, 8_999_999_950);
		// When
		const refused = await answer(await upload(h, headers));
		// Then
		expect({ ...refused, stored: await h.storedBytes() }).toEqual({
			status: 507,
			body: { error: "storage_full" },
			stored: 8999999950,
		});
	});

	test("takes an upload that ends at 9 GB", async () => {
		// Given
		const { h, headers } = await withAccount();
		await h.addAccount(BOB);
		await h.seedPictures("bob-id", 1, 8_999_999_900);
		// When
		const uploaded = await upload(h, headers);
		// Then
		expect({
			status: uploaded.status,
			stored: await h.storedBytes(),
		}).toEqual({ status: 201, stored: 9000000000 });
	});

	test("stops uploads at 900,000 uploads this month", async () => {
		// Given
		const { h, headers } = await withAccount();
		setSystemTime(new Date("2026-11-18T12:00:00Z"));
		await h.setUploads("2026-11", 900_000);
		// When
		const refused = await answer(await upload(h, headers));
		// Then
		expect({ ...refused, months: await months(h) }).toEqual({
			status: 507,
			body: { error: "storage_full" },
			months: [{ month: "2026-11", count: 900000 }],
		});
	});

	test("takes uploads again in a new month", async () => {
		// Given
		const { h, headers } = await withAccount();
		setSystemTime(new Date("2026-11-18T12:00:00Z"));
		await h.setUploads("2026-10", 900_000);
		// When
		const uploaded = await upload(h, headers);
		// Then
		expect({
			status: uploaded.status,
			months: (await months(h)).sort((a, b) => a.month.localeCompare(b.month)),
		}).toEqual({
			status: 201,
			months: [
				{ month: "2026-10", count: 900000 },
				{ month: "2026-11", count: 1 },
			],
		});
	});

	test("counts each upload in its month", async () => {
		// Given
		const { h, headers } = await withAccount();
		setSystemTime(new Date("2026-11-18T12:00:00Z"));
		// When
		const statuses = [
			(await upload(h, headers)).status,
			(await upload(h, headers)).status,
		];
		await h.seedPictures("alice-id", 998);
		statuses.push((await upload(h, headers, PNG)).status);
		// Then
		expect({ statuses, months: await months(h) }).toEqual({
			statuses: [201, 201, 409],
			months: [{ month: "2026-11", count: 2 }],
		});
	});

	test("refuses one of two uploads that overlap at 999 pictures", async () => {
		// Given
		const { h } = await withAccount();
		await h.seedPictures("alice-id", 999);
		// When
		const results = await Promise.all([
			addPicture(
				h.db,
				h.pictures as unknown as R2Bucket,
				"alice-id",
				JPEG.buffer,
			),
			addPicture(
				h.db,
				h.pictures as unknown as R2Bucket,
				"alice-id",
				JPEG.buffer,
			),
		]);
		// Then
		expect({
			count: (await h.rows(picture, "alice-id")).length,
			oks: results.map((r) => r.ok).sort(),
			refused: results.flatMap((r) => (r.ok ? [] : [r.error as unknown])),
		}).toEqual({
			count: 1000,
			oks: [false, true],
			refused: [{ code: "account_picture_limit" }],
		});
	});

	test("refuses one of two uploads that overlap at 899,999 uploads this month", async () => {
		// Given
		const { h } = await withAccount();
		setSystemTime(new Date("2026-11-18T12:00:00Z"));
		await h.setUploads("2026-11", 899_999);
		// When
		const results = await Promise.all([
			addPicture(
				h.db,
				h.pictures as unknown as R2Bucket,
				"alice-id",
				JPEG.buffer,
			),
			addPicture(
				h.db,
				h.pictures as unknown as R2Bucket,
				"alice-id",
				JPEG.buffer,
			),
		]);
		// Then
		expect({
			oks: results.map((r) => r.ok).sort(),
			refused: results.flatMap((r) => (r.ok ? [] : [r.error as unknown])),
			month: (await months(h))[0]?.count,
		}).toEqual({
			oks: [false, true],
			refused: [{ code: "storage_full" }],
			month: 900000,
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

// A Navy wool jacket wish with one shop link for each list of pictures.
async function addLinks(h: Harness, headers: Headers, lists: string[][]) {
	const navy = (await colourIds(h, headers)).Navy;
	const wishId = crypto.randomUUID();
	await send(h, headers, "POST", "/api/wishes", {
		id: wishId,
		typeId: "wool",
		colourId: navy,
	});
	const linkIds: string[] = [];
	for (const pictureIds of lists) {
		const id = crypto.randomUUID();
		const res = await send(
			h,
			headers,
			"POST",
			`/api/wishes/${wishId}/shop-links`,
			{
				id,
				url: "https://cos.com/jacket",
				brandId: null,
				name: "Wool jacket",
				price: null,
				pictureIds,
			},
		);
		expect(res.status).toBe(201);
		linkIds.push(id);
	}
	return { wishId, linkIds };
}

describe("drafts", () => {
	afterEach(() => setSystemTime());

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

	test("sweeps drafts older than a day at the next upload", async () => {
		// Given
		const { h, headers } = await withAccount();
		setSystemTime(new Date("2026-11-17T10:00:00Z"));
		const old = await uploadPicture(h, headers);
		setSystemTime(new Date("2026-11-18T11:00:00Z"));
		// When
		const fresh = await uploadPicture(h, headers);
		const loaded = await send(h, headers, "GET", `/api/pictures/${old}`);
		// Then
		expect({ loaded: loaded.status, keys: h.pictures.keys() }).toEqual({
			loaded: 404,
			keys: [fresh],
		});
	});

	test("keeps a shop link's picture older than a day at the next upload", async () => {
		// Given
		const { h, headers } = await withAccount();
		setSystemTime(new Date("2026-11-17T10:00:00Z"));
		const old = await uploadPicture(h, headers);
		await addLinks(h, headers, [[old]]);
		setSystemTime(new Date("2026-11-18T11:00:00Z"));
		// When
		const fresh = await uploadPicture(h, headers);
		const loaded = await send(h, headers, "GET", `/api/pictures/${old}`);
		// Then
		expect({ loaded: loaded.status, keys: h.pictures.keys() }).toEqual({
			loaded: 200,
			keys: [fresh, old].sort(),
		});
	});

	test("keeps a draft younger than a day", async () => {
		// Given
		const { h, headers } = await withAccount();
		setSystemTime(new Date("2026-11-17T10:00:00Z"));
		const old = await uploadPicture(h, headers);
		setSystemTime(new Date("2026-11-18T09:00:00Z"));
		// When
		const fresh = await uploadPicture(h, headers);
		// Then
		expect(h.pictures.keys()).toEqual([old, fresh].sort());
	});
});

describe("deletes and the stored bytes", () => {
	test("keeps the stored bytes equal to the pictures' bytes", async () => {
		// Given: three uploads of 100 bytes; a and b on an item, c a draft
		const { h, headers } = await withAccount();
		const a = await uploadPicture(h, headers);
		const b = await uploadPicture(h, headers);
		const c = await uploadPicture(h, headers);
		const item = await addItem(h, headers, [a, b]);
		const steps: { stored: number; rows: number }[] = [];
		const record = async () =>
			steps.push({
				stored: await h.storedBytes(),
				rows: (await h.rows(picture)).reduce((sum, row) => sum + row.bytes, 0),
			});
		// When
		await send(h, headers, "PUT", `/api/owned-items/${item}`, {
			brandId: null,
			quantity: 1,
			pictureIds: [a],
		});
		await record();
		await send(h, headers, "DELETE", `/api/pictures/${c}`);
		await record();
		await send(h, headers, "DELETE", `/api/owned-items/${item}`);
		await record();
		// Then
		expect(steps).toEqual([
			{ stored: 200, rows: 200 },
			{ stored: 100, rows: 100 },
			{ stored: 0, rows: 0 },
		]);
	});

	test("keeps the stored bytes equal when shop link pictures go", async () => {
		// Given: three uploads of 100 bytes; a and b on one link, c on another
		// link of the same wish
		const { h, headers } = await withAccount();
		const a = await uploadPicture(h, headers);
		const b = await uploadPicture(h, headers);
		const c = await uploadPicture(h, headers);
		const { wishId, linkIds } = await addLinks(h, headers, [[a, b], [c]]);
		const steps: { stored: number; rows: number }[] = [];
		const record = async () =>
			steps.push({
				stored: await h.storedBytes(),
				rows: (await h.rows(picture)).reduce((sum, row) => sum + row.bytes, 0),
			});
		// When
		await send(h, headers, "DELETE", `/api/shop-links/${linkIds[0]}`);
		await record();
		await send(h, headers, "DELETE", `/api/wishes/${wishId}`);
		await record();
		// Then
		expect(steps).toEqual([
			{ stored: 100, rows: 100 },
			{ stored: 0, rows: 0 },
		]);
	});

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
