import { describe, expect, setSystemTime, test } from "bun:test";
import { schema } from "./db";
import {
	type aiSession,
	answer,
	BOB,
	bytes,
	type Harness,
	JPEG,
	PDF,
	PNG,
	uploadPicture,
	withAiSession,
} from "./test/harness";
import { claimUploadAddress, giveUploadAddress } from "./upload-address-store";

type Session = Awaited<ReturnType<typeof aiSession>>;

const GONE = {
	error: "address_gone",
	message:
		"This upload address was used or has expired. get_upload_address gives a new one.",
};

const addressOf = async (ai: Session) => {
	const { data } = await ai.call("get_upload_address");
	return (data as { address: string }).address;
};

// An AI app sends the bytes as they are, with no sign-in.
const postTo = (h: Harness, address: string, body: Uint8Array = JPEG) =>
	h.app.request(address, { method: "POST", body }, h.env);

const uploadByAddress = async (h: Harness, address: string, body = JPEG) => {
	const res = await postTo(h, address, body);
	expect(res.status).toBe(201);
	return ((await res.json()) as { pictureId: string }).pictureId;
};

describe("upload address", () => {
	test("gives an upload address that lasts 15 minutes", async () => {
		// Given
		setSystemTime(new Date("2026-11-19T10:00:00Z"));
		const { ai } = await withAiSession();
		// When
		const { isError, data } = await ai.call("get_upload_address");
		// Then
		const { address, expiresAt } = data as {
			address: string;
			expiresAt: string;
		};
		expect({ isError, address, expiresAt }).toEqual({
			isError: false,
			address: expect.stringMatching(
				/^http:\/\/localhost:5173\/api\/uploads\/[0-9a-f-]{36}$/,
			),
			expiresAt: "2026-11-19T10:15:00.000Z",
		});
	});

	test("takes a picture by address with no sign-in", async () => {
		// Given
		const { h, ai, userId } = await withAiSession();
		const address = await addressOf(ai);
		// When
		const res = await postTo(h, address);
		// Then
		const status = res.status;
		const { pictureId } = (await res.json()) as { pictureId: string };
		const rows = (await h.rows(schema.picture)).map(
			({ userId, ownedItemId, shopLinkId, bytes }) => ({
				userId,
				ownedItemId,
				shopLinkId,
				bytes,
			}),
		);
		expect({ status, rows, keys: h.pictures.keys() }).toEqual({
			status: 201,
			rows: [{ userId, ownedItemId: null, shopLinkId: null, bytes: 100 }],
			keys: [pictureId],
		});
	});

	test("refuses an address used twice", async () => {
		// Given
		const { h, ai } = await withAiSession();
		const address = await addressOf(ai);
		const pictureId = await uploadByAddress(h, address);
		// When
		const refused = await answer(await postTo(h, address));
		// Then
		expect({ ...refused, keys: h.pictures.keys() }).toEqual({
			status: 410,
			body: GONE,
			keys: [pictureId],
		});
	});

	test("refuses an address 15 minutes after it was given", async () => {
		// Given
		setSystemTime(new Date("2026-11-19T10:00:00Z"));
		const { h, ai } = await withAiSession();
		const address = await addressOf(ai);
		setSystemTime(new Date("2026-11-19T10:15:00Z"));
		// When
		const refused = await answer(await postTo(h, address));
		// Then
		expect({ ...refused, keys: h.pictures.keys() }).toEqual({
			status: 410,
			body: GONE,
			keys: [],
		});
	});

	test("keeps an address picture from another account", async () => {
		// Given
		const { h, ai } = await withAiSession();
		const pictureId = await uploadByAddress(h, await addressOf(ai));
		const bob = await h.addAccount(BOB);
		// When
		const loaded = await h.app.request(
			`/api/pictures/${pictureId}`,
			{ headers: bob },
			h.env,
		);
		const deleted = await h.app.request(
			`/api/pictures/${pictureId}`,
			{ method: "DELETE", headers: bob },
			h.env,
		);
		// Then
		expect({
			loaded: loaded.status,
			deleted: deleted.status,
			keys: h.pictures.keys(),
		}).toEqual({ loaded: 404, deleted: 404, keys: [pictureId] });
	});

	test("counts get_upload_address and not the upload", async () => {
		// Given
		const { h, ai } = await withAiSession();
		setSystemTime(Math.ceil(Date.now() / 60_000) * 60_000 + 1000);
		const address = await addressOf(ai);
		// When
		const res = await postTo(h, address);
		// Then
		expect({
			status: res.status,
			counts: (await h.rows(schema.aiActionCount)).map((r) => r.count),
		}).toEqual({ status: 201, counts: [1] });
	});

	test("refuses get_upload_address as the 61st AI action", async () => {
		// Given
		const { h, ai } = await withAiSession();
		setSystemTime(Math.ceil(Date.now() / 60_000) * 60_000 + 1000);
		for (let i = 0; i < 60; i++)
			expect((await ai.call("list_tags")).isError).toBe(false);
		// When
		const { isError, text } = await ai.call("get_upload_address");
		// Then
		expect({
			isError,
			text,
			addresses: await h.rows(schema.uploadAddress),
		}).toEqual({
			isError: true,
			text: "Too many actions. Wait a minute and try again.",
			addresses: [],
		});
	});

	test("drops an expired address when a new one is given", async () => {
		// Given
		setSystemTime(new Date("2026-11-19T10:00:00Z"));
		const { h, ai } = await withAiSession();
		await addressOf(ai);
		setSystemTime(new Date("2026-11-19T10:16:00Z"));
		// When
		await ai.call("get_upload_address");
		// Then
		expect({
			addresses: (await h.rows(schema.uploadAddress)).length,
		}).toEqual({ addresses: 1 });
	});

	test("claims an address once when two uploads come at once", async () => {
		// Given
		const { h, userId } = await withAiSession();
		const { id } = await giveUploadAddress(h.db, userId);
		// When
		const results = await Promise.all([
			claimUploadAddress(h.db, id),
			claimUploadAddress(h.db, id),
		]);
		// Then
		expect({
			claimed: results.filter((r) => r !== null),
			addresses: (await h.rows(schema.uploadAddress)).length,
		}).toEqual({ claimed: [userId], addresses: 0 });
	});
});

// A Navy long button-up, no brand, two of them.
const shirt = async (ai: Session) => {
	const { data } = await ai.call("list_colours");
	const navy = (
		data as { colours: { id: string; name: string }[] }
	).colours.find((c) => c.name === "Navy");
	return { typeId: "shirt_l", colourId: navy?.id, quantity: 2 };
};

type Item = { id: string; quantity: number; pictureIds: string[] };

const uploads = async (h: Harness, ai: Session, n: number) => {
	const ids: string[] = [];
	for (let i = 0; i < n; i++)
		ids.push(await uploadByAddress(h, await addressOf(ai)));
	return ids;
};

describe("owned item pictures", () => {
	test("adds an owned item with a picture sent by address", async () => {
		// Given
		const { h, ai } = await withAiSession();
		const [a] = await uploads(h, ai, 1);
		const args = await shirt(ai);
		// When
		await ai.call("add_owned_item", { ...args, pictureIds: [a] });
		const { data } = await ai.call("list_owned_items");
		// Then
		const [item] = (data as { ownedItems: Item[] }).ownedItems;
		expect(item.pictureIds).toEqual([a]);
	});
});

type Link = { id: string; pictureIds: string[] };

const coat = {
	url: "https://www.cos.com/coat",
	name: "Wool coat",
};

// A wish for a Navy wool jacket, and its id.
const addWish = async (ai: Session) => {
	const { colourId } = await shirt(ai);
	const { data } = await ai.call("add_wish", { typeId: "wool", colourId });
	return (data as { wish: { id: string } }).wish.id;
};

describe("shop link pictures", () => {
	test("adds a shop link with a picture sent by address", async () => {
		// Given
		const { h, ai } = await withAiSession();
		const wishId = await addWish(ai);
		const [a] = await uploads(h, ai, 1);
		// When
		await ai.call("add_shop_link", { wishId, ...coat, pictureIds: [a] });
		const { data } = await ai.call("list_wishes");
		// Then
		const [wish] = (data as { wishes: { shopLinks: Link[] }[] }).wishes;
		expect(wish.shopLinks[0]?.pictureIds).toEqual([a]);
	});
});

describe("refusals at the address", () => {
	test("refuses a file that is not a picture", async () => {
		// Given
		const { h, ai } = await withAiSession();
		const address = await addressOf(ai);
		// When
		const refused = await answer(await postTo(h, address, PDF));
		// Then
		expect({ ...refused, keys: h.pictures.keys() }).toEqual({
			status: 400,
			body: {
				error: "invalid",
				field: "body",
				message:
					"This file is not a JPEG, PNG, or WebP picture. Send one of these to a new upload address.",
			},
			keys: [],
		});
	});

	test("refuses a picture over 1 MB", async () => {
		// Given
		const { h, ai } = await withAiSession();
		const address = await addressOf(ai);
		// When
		const refused = await answer(
			await postTo(h, address, bytes([0xff, 0xd8, 0xff, 0xe0], 1_048_577)),
		);
		// Then
		expect({ ...refused, keys: h.pictures.keys() }).toEqual({
			status: 413,
			body: {
				error: "too_large",
				message:
					"This picture is over 1 MB. Shrink it to 1 MB or less and send it to a new upload address.",
			},
			keys: [],
		});
	});

	test("keeps nothing when the bucket write fails", async () => {
		// Given
		const { h, ai } = await withAiSession();
		const address = await addressOf(ai);
		h.pictures.failPuts = true;
		// When
		const refused = await answer(await postTo(h, address));
		// Then
		expect({ ...refused, rows: await h.rows(schema.picture) }).toEqual({
			status: 500,
			body: {
				error: "not_stored",
				message:
					"dressup could not store the picture and kept nothing. Try again with a new upload address.",
			},
			rows: [],
		});
	});
});

describe("show_picture", () => {
	const noPicture = {
		isError: true,
		content: [{ type: "text", text: "No picture with this id." }],
	};

	test("shows a picture as an image", async () => {
		// Given
		const { h, ai } = await withAiSession();
		const p = await uploadByAddress(h, await addressOf(ai), PNG);
		// When
		const shown = await ai.show("show_picture", { id: p });
		// Then
		expect(shown).toEqual({
			isError: false,
			content: [
				{
					type: "image",
					data: "iVBORw0KGgoREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREQ==",
					mimeType: "image/png",
				},
			],
		});
	});

	test("refuses a picture of another account", async () => {
		// Given
		const { h, ai } = await withAiSession();
		const bob = await h.addAccount(BOB);
		const p = await uploadPicture(h, bob, PNG);
		// When
		const shown = await ai.show("show_picture", { id: p });
		// Then
		expect(shown).toEqual(noPicture);
	});
});
