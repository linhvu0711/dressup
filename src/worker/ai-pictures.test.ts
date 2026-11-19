import { afterEach, describe, expect, setSystemTime, test } from "bun:test";
import { schema } from "./db";
import {
	type aiSession,
	BOB,
	type Harness,
	withAiSession,
} from "./test/harness";
import { claimUploadAddress, giveUploadAddress } from "./upload-address-store";

type Session = Awaited<ReturnType<typeof aiSession>>;

// The server checks only the first bytes, so these are not whole pictures.
const bytes = (head: number[], length: number) => {
	const body = new Uint8Array(length).fill(0x11);
	body.set(head);
	return body;
};

const JPEG = bytes([0xff, 0xd8, 0xff, 0xe0], 100);

const GONE = {
	error: "address_gone",
	message:
		"This upload address was used or has expired. get_upload_address gives a new one.",
};

afterEach(() => setSystemTime());

const addressOf = async (ai: Session) => {
	const { data } = await ai.call("get_upload_address");
	return (data as { address: string }).address;
};

// An AI app sends the bytes as they are, with no sign-in.
const postTo = (h: Harness, address: string, body: Uint8Array = JPEG) =>
	h.app.request(address, { method: "POST", body }, h.env);

const answer = async (response: Response) => ({
	status: response.status,
	body: await response.json(),
});

const uploadByAddress = async (h: Harness, address: string, body = JPEG) => {
	const res = await postTo(h, address, body);
	expect(res.status).toBe(201);
	return ((await res.json()) as { pictureId: string }).pictureId;
};

const addressFor = async (h: Harness, userId: string) =>
	`http://localhost:5173/api/uploads/${(await giveUploadAddress(h.db, userId)).id}`;

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

	test("sweeps an address draft older than a day at the next upload", async () => {
		// Given: no tool call after the clock jumps, since the session's
		// access token lives one hour.
		const { h, userId } = await withAiSession();
		setSystemTime(new Date("2026-11-17T10:00:00Z"));
		await uploadByAddress(h, await addressFor(h, userId));
		setSystemTime(new Date("2026-11-18T11:00:00Z"));
		// When
		const fresh = await uploadByAddress(h, await addressFor(h, userId));
		// Then
		expect({ keys: h.pictures.keys() }).toEqual({ keys: [fresh] });
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
