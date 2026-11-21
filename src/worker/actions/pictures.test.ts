import { describe, expect, setSystemTime, test } from "bun:test";
import type { PictureId } from "@/pictures/picture";
import { listColours } from "../colour-store";
import { picture, pictureUploadMonth } from "../db/picture-schema";
import type { Result } from "../result";
import {
	ALICE,
	BOB,
	bytes,
	type Harness,
	JPEG,
	PNG,
	scopeOf,
	withAccount,
} from "../test/harness";
import type { ActionScope, Refusal } from "./action";
import { ownedItemActions } from "./owned-items";
import { pictureActions } from "./pictures";
import { shopLinkActions, wishActions } from "./wishes";

const WEBP = bytes(
	[0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50],
	100,
);

const NO_SUCH_ID = "5b1f2c3d-0000-4000-8000-000000000000";

// A setup step that must not be refused.
function held<T>(result: Result<T, Refusal>): T {
	if (!result.ok) throw new Error(`Refused: ${result.error.text}`);
	return result.value;
}

async function withAlice() {
	const { h } = await withAccount();
	return { h, alice: scopeOf(h) };
}

const upload = (alice: ActionScope, body: Uint8Array = JPEG) =>
	pictureActions.add.run(alice, { bytes: body.buffer as ArrayBuffer });

const uploaded = async (alice: ActionScope, body: Uint8Array = JPEG) =>
	held(await upload(alice, body)).id;

// The status the web answers: 201 for a picture added.
const statusOf = (result: Result<unknown, Refusal>) =>
	result.ok ? 201 : result.error.status;

const statusOfRead = async (alice: ActionScope, id: string) => {
	const loaded = await pictureActions.read.run(alice, { id });
	return loaded.ok ? 200 : loaded.error.status;
};

const NOT_FOUND_ROW = {
	code: "not_found",
	status: 404,
	body: { error: "not_found" },
	text: "No picture with this id.",
} satisfies Refusal;

const NOT_STORED_ROW = {
	code: "not_stored",
	status: 500,
	body: { error: "not_stored" },
	text: "dressup could not store the picture and kept nothing. Try again with a new upload address.",
} satisfies Refusal;

const ACCOUNT_LIMIT_ROW = {
	code: "account_picture_limit",
	status: 409,
	body: { error: "account_picture_limit" },
	text: "You have 1,000 pictures. That is the limit. Take pictures off an owned item or a shop link to add new ones.",
} satisfies Refusal;

const STORAGE_FULL_ROW = {
	code: "storage_full",
	status: 507,
	body: { error: "storage_full" },
	text: "Picture storage is full. No new pictures for now.",
} satisfies Refusal;

const navyOf = async (h: Harness) => {
	const navy = (await listColours(h.db, ALICE.id)).find(
		(c) => c.name === "Navy",
	);
	if (!navy) throw new Error("No Navy");
	return navy.id;
};

// An owned item with these pictures: a Navy long button-up, no brand.
async function addItem(
	h: Harness,
	alice: ActionScope,
	pictureIds: PictureId[],
) {
	const id = crypto.randomUUID();
	held(
		await ownedItemActions.add.run(alice, {
			id,
			typeId: "shirt_l",
			colourId: await navyOf(h),
			brandId: null,
			quantity: 1,
			pictureIds,
		}),
	);
	return id;
}

// A Navy wool jacket wish with one shop link for each list of pictures.
async function addLinks(h: Harness, alice: ActionScope, lists: PictureId[][]) {
	const wishId = crypto.randomUUID();
	held(
		await wishActions.add.run(alice, {
			id: wishId,
			typeId: "wool",
			colourId: await navyOf(h),
		}),
	);
	const linkIds: string[] = [];
	for (const pictureIds of lists) {
		const id = crypto.randomUUID();
		held(
			await shopLinkActions.add.run(alice, {
				wishId,
				id,
				url: "https://cos.com/jacket",
				brandId: null,
				name: "Wool jacket",
				price: null,
				pictureIds,
			}),
		);
		linkIds.push(id);
	}
	return { wishId, linkIds };
}

describe("uploading and loading", () => {
	test("uploads a PNG and a WebP", async () => {
		// Given
		const { alice } = await withAlice();
		// When
		const oks = [];
		const types = [];
		for (const body of [PNG, WEBP]) {
			const added = await upload(alice, body);
			oks.push(added.ok);
			const loaded = held(
				await pictureActions.read.run(alice, { id: held(added).id }),
			);
			const headers = new Headers();
			loaded.writeHttpMetadata(headers);
			types.push(headers.get("content-type"));
		}
		// Then
		expect({ oks, types }).toEqual({
			oks: [true, true],
			types: ["image/png", "image/webp"],
		});
	});

	test("answers 404 for an id no picture has", async () => {
		// Given
		const { alice } = await withAlice();
		await upload(alice);
		// When
		const missing = await pictureActions.read.run(alice, { id: NO_SUCH_ID });
		const notAnId = await pictureActions.read.run(alice, { id: "nope" });
		// Then
		expect([missing, notAnId]).toEqual([
			{ ok: false, error: NOT_FOUND_ROW },
			{ ok: false, error: NOT_FOUND_ROW },
		]);
	});

	test("removes the row when the bucket refuses the upload", async () => {
		// Given
		const { h, alice } = await withAlice();
		h.pictures.failPuts = true;
		// When
		const added = await upload(alice);
		// Then
		expect({ added, rows: await h.rows(picture) }).toEqual({
			added: { ok: false, error: NOT_STORED_ROW },
			rows: [],
		});
	});

	test("takes back the month's count when the bucket refuses the upload", async () => {
		// Given
		const { h, alice } = await withAlice();
		await upload(alice);
		h.pictures.failPuts = true;
		// When
		await upload(alice);
		// Then
		expect(await h.rows(pictureUploadMonth)).toEqual([
			{ month: new Date().toISOString().slice(0, 7), count: 1 },
		]);
	});
});

describe("limits and the storage stop", () => {
	const months = (h: Harness) => h.rows(pictureUploadMonth);

	test("takes picture 1,000 of an account", async () => {
		// Given
		const { h, alice } = await withAlice();
		await h.seedPictures(ALICE.id, 999);
		// When
		const added = await upload(alice);
		// Then
		expect(statusOf(added)).toBe(201);
	});

	test("refuses picture 1,001 of an account", async () => {
		// Given
		const { h, alice } = await withAlice();
		await h.seedPictures(ALICE.id, 1000);
		// When
		const refused = await upload(alice);
		// Then
		expect({ refused, keys: h.pictures.keys() }).toEqual({
			refused: { ok: false, error: ACCOUNT_LIMIT_ROW },
			keys: [],
		});
	});

	test("refuses picture 1,001 when one is on a shop link", async () => {
		// Given
		const { h, alice } = await withAlice();
		await h.seedPictures(ALICE.id, 999);
		await addLinks(h, alice, [[await uploaded(alice)]]);
		// When
		const refused = await upload(alice);
		// Then
		expect(refused).toEqual({ ok: false, error: ACCOUNT_LIMIT_ROW });
	});

	test("stops uploads when all pictures reach 9 GB", async () => {
		// Given
		const { h, alice } = await withAlice();
		await h.addAccount(BOB);
		await h.seedPictures("bob-id", 1, 8_999_999_950);
		// When
		const refused = await upload(alice);
		// Then
		expect({
			refused,
			keys: h.pictures.keys(),
			stored: await h.storedBytes(),
		}).toEqual({
			refused: { ok: false, error: STORAGE_FULL_ROW },
			keys: [],
			stored: 8999999950,
		});
	});

	test("takes an upload that ends at 9 GB", async () => {
		// Given
		const { h, alice } = await withAlice();
		await h.addAccount(BOB);
		await h.seedPictures("bob-id", 1, 8_999_999_900);
		// When
		const added = await upload(alice);
		// Then
		expect({
			status: statusOf(added),
			stored: await h.storedBytes(),
		}).toEqual({ status: 201, stored: 9000000000 });
	});

	test("stops uploads at 900,000 uploads this month", async () => {
		// Given
		const { h, alice } = await withAlice();
		setSystemTime(new Date("2026-11-18T12:00:00Z"));
		await h.setUploads("2026-11", 900_000);
		// When
		const refused = await upload(alice);
		// Then
		expect({ refused, months: await months(h) }).toEqual({
			refused: { ok: false, error: STORAGE_FULL_ROW },
			months: [{ month: "2026-11", count: 900000 }],
		});
	});

	test("takes uploads again in a new month", async () => {
		// Given
		const { h, alice } = await withAlice();
		setSystemTime(new Date("2026-11-18T12:00:00Z"));
		await h.setUploads("2026-10", 900_000);
		// When
		const added = await upload(alice);
		// Then
		expect({
			status: statusOf(added),
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
		const { h, alice } = await withAlice();
		setSystemTime(new Date("2026-11-18T12:00:00Z"));
		// When
		const statuses = [
			statusOf(await upload(alice)),
			statusOf(await upload(alice)),
		];
		await h.seedPictures(ALICE.id, 998);
		statuses.push(statusOf(await upload(alice, PNG)));
		// Then
		expect({ statuses, months: await months(h) }).toEqual({
			statuses: [201, 201, 409],
			months: [{ month: "2026-11", count: 2 }],
		});
	});

	test("refuses one of two uploads that overlap at 999 pictures", async () => {
		// Given
		const { h, alice } = await withAlice();
		await h.seedPictures(ALICE.id, 999);
		// When
		const results = await Promise.all([upload(alice), upload(alice)]);
		// Then
		expect({
			count: (await h.rows(picture, ALICE.id)).length,
			oks: results.map((r) => r.ok).sort(),
			refused: results.flatMap((r) => (r.ok ? [] : [r.error])),
		}).toEqual({
			count: 1000,
			oks: [false, true],
			refused: [ACCOUNT_LIMIT_ROW],
		});
	});

	test("refuses one of two uploads that overlap at 899,999 uploads this month", async () => {
		// Given
		const { h, alice } = await withAlice();
		setSystemTime(new Date("2026-11-18T12:00:00Z"));
		await h.setUploads("2026-11", 899_999);
		// When
		const results = await Promise.all([upload(alice), upload(alice)]);
		// Then
		expect({
			oks: results.map((r) => r.ok).sort(),
			refused: results.flatMap((r) => (r.ok ? [] : [r.error])),
			month: (await months(h))[0]?.count,
		}).toEqual({
			oks: [false, true],
			refused: [STORAGE_FULL_ROW],
			month: 900000,
		});
	});
});

describe("drafts", () => {
	test("sweeps drafts older than a day at the next upload", async () => {
		// Given
		const { h, alice } = await withAlice();
		setSystemTime(new Date("2026-11-17T10:00:00Z"));
		const old = await uploaded(alice);
		setSystemTime(new Date("2026-11-18T11:00:00Z"));
		// When
		const fresh = await uploaded(alice);
		// Then
		expect({
			loaded: await statusOfRead(alice, old),
			keys: h.pictures.keys(),
		}).toEqual({ loaded: 404, keys: [fresh] });
	});

	test("keeps a shop link's picture older than a day at the next upload", async () => {
		// Given
		const { h, alice } = await withAlice();
		setSystemTime(new Date("2026-11-17T10:00:00Z"));
		const old = await uploaded(alice);
		await addLinks(h, alice, [[old]]);
		setSystemTime(new Date("2026-11-18T11:00:00Z"));
		// When
		const fresh = await uploaded(alice);
		// Then
		expect({
			loaded: await statusOfRead(alice, old),
			keys: h.pictures.keys(),
		}).toEqual({ loaded: 200, keys: [fresh, old].sort() });
	});

	test("keeps a draft younger than a day", async () => {
		// Given
		const { h, alice } = await withAlice();
		setSystemTime(new Date("2026-11-17T10:00:00Z"));
		const old = await uploaded(alice);
		setSystemTime(new Date("2026-11-18T09:00:00Z"));
		// When
		const fresh = await uploaded(alice);
		// Then
		expect(h.pictures.keys()).toEqual([old, fresh].sort());
	});
});

describe("deletes and the stored bytes", () => {
	test("keeps the stored bytes equal to the pictures' bytes", async () => {
		// Given: three uploads of 100 bytes; a and b on an item, c a draft
		const { h, alice } = await withAlice();
		const a = await uploaded(alice);
		const b = await uploaded(alice);
		const c = await uploaded(alice);
		const item = await addItem(h, alice, [a, b]);
		const steps: { stored: number; rows: number }[] = [];
		const record = async () =>
			steps.push({
				stored: await h.storedBytes(),
				rows: (await h.rows(picture)).reduce((sum, row) => sum + row.bytes, 0),
			});
		// When
		await ownedItemActions.change.run(alice, {
			id: item,
			brandId: null,
			quantity: 1,
			pictureIds: [a],
		});
		await record();
		await pictureActions.deleteDraft.run(alice, { id: c });
		await record();
		await ownedItemActions.delete.run(alice, { id: item });
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
		const { h, alice } = await withAlice();
		const a = await uploaded(alice);
		const b = await uploaded(alice);
		const c = await uploaded(alice);
		const { wishId, linkIds } = await addLinks(h, alice, [[a, b], [c]]);
		const steps: { stored: number; rows: number }[] = [];
		const record = async () =>
			steps.push({
				stored: await h.storedBytes(),
				rows: (await h.rows(picture)).reduce((sum, row) => sum + row.bytes, 0),
			});
		// When
		await shopLinkActions.delete.run(alice, { id: linkIds[0] ?? "" });
		await record();
		await wishActions.delete.run(alice, { id: wishId });
		await record();
		// Then
		expect(steps).toEqual([
			{ stored: 100, rows: 100 },
			{ stored: 0, rows: 0 },
		]);
	});
});
