import { describe, expect, test } from "bun:test";
import { picture } from "./db/picture-schema";
import { BOB, type Harness, makeHarness, withAccount } from "./test/harness";

const bytes = (head: number[], length: number) => {
	const body = new Uint8Array(length).fill(0x11);
	body.set(head);
	return body;
};

const JPEG = bytes([0xff, 0xd8, 0xff, 0xe0], 100);
const PNG = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 100);
const WEBP = bytes(
	[0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50],
	100,
);
const PDF = bytes([...new TextEncoder().encode("%PDF-1.7")], 100);

const NO_SUCH_ID = "5b1f2c3d-0000-4000-8000-000000000000";

// A body goes as it is: an upload is bytes, not JSON.
const send = (
	{ app, env }: Harness,
	headers: Headers,
	method: string,
	path: string,
	body?: Uint8Array,
) =>
	app.request(
		path,
		{
			method,
			headers: {
				...Object.fromEntries(headers),
				...(body === undefined ? {} : { "content-type": "image/jpeg" }),
			},
			body,
		},
		env,
	);

const upload = (h: Harness, headers: Headers, body: Uint8Array = JPEG) =>
	send(h, headers, "POST", "/api/pictures", body);

const uploadedId = async (h: Harness, headers: Headers, body = JPEG) =>
	(
		(await (await upload(h, headers, body)).json()) as {
			picture: { id: string };
		}
	).picture.id;

const answer = async (response: Response) => ({
	status: response.status,
	body: await response.json(),
});

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
		const bobs = await uploadedId(h, bob);
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
});
