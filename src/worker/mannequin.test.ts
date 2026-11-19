import { describe, expect, test } from "bun:test";
import { type Harness, makeHarness, withAccount } from "./test/harness";

const send = (
	{ app, env }: Harness,
	headers: Headers,
	method: string,
	path: string,
	body?: unknown,
) =>
	app.request(
		path,
		{
			method,
			headers: {
				...Object.fromEntries(headers),
				...(body === undefined ? {} : { "content-type": "application/json" }),
			},
			body: body === undefined ? undefined : JSON.stringify(body),
		},
		env,
	);

const answer = async (res: Response) => ({
	status: res.status,
	body: await res.json(),
});

const getMannequin = (h: Harness, headers: Headers) =>
	send(h, headers, "GET", "/api/mannequin");

const putColour = (h: Harness, headers: Headers, part: string, hex: string) =>
	send(h, headers, "PUT", `/api/mannequin/${part}`, { hex });

describe("GET /api/mannequin", () => {
	test("gives a new account the starter skin and hair", async () => {
		// Given: alice signed in, no mannequin row
		const { h, headers } = await withAccount();
		// When
		const res = await getMannequin(h, headers);
		// Then
		expect(await answer(res)).toEqual({
			status: 200,
			body: { mannequin: { skin: "#D6A27B", hair: "#141418" } },
		});
	});

	test("refuses the mannequin without a session", async () => {
		// Given: no session
		const h = await makeHarness();
		// When
		const res = await getMannequin(h, new Headers());
		// Then
		expect(await answer(res)).toEqual({
			status: 401,
			body: { error: "unauthorized" },
		});
	});
});

describe("PUT /api/mannequin/:part", () => {
	test("sets the skin and keeps the hair", async () => {
		// Given: alice signed in, no mannequin row
		const { h, headers } = await withAccount();
		// When
		const put = await answer(await putColour(h, headers, "skin", "#8D5524"));
		const got = await answer(await getMannequin(h, headers));
		// Then
		const set = {
			status: 200,
			body: { mannequin: { skin: "#8D5524", hair: "#141418" } },
		};
		expect({ put, got }).toEqual({ put: set, got: set });
	});

	test("keeps a skin from one device and a hair from another", async () => {
		// Given: alice signed in, no mannequin row
		const { h, headers } = await withAccount();
		// When
		await putColour(h, headers, "skin", "#8D5524");
		await putColour(h, headers, "hair", "#B55239");
		const res = await getMannequin(h, headers);
		// Then
		expect(await res.json()).toEqual({
			mannequin: { skin: "#8D5524", hair: "#B55239" },
		});
	});

	test("ends in the same colours when one skin is set twice", async () => {
		// Given: alice signed in, no mannequin row
		const { h, headers } = await withAccount();
		// When
		await putColour(h, headers, "skin", "#8D5524");
		await putColour(h, headers, "skin", "#8D5524");
		const res = await getMannequin(h, headers);
		// Then
		expect(await res.json()).toEqual({
			mannequin: { skin: "#8D5524", hair: "#141418" },
		});
	});

	test("refuses a colour that is not a colour code", async () => {
		// Given: alice signed in, no mannequin row
		const { h, headers } = await withAccount();
		// When
		const res = await putColour(h, headers, "skin", "brown");
		// Then
		expect(await answer(res)).toEqual({
			status: 400,
			body: { error: "invalid", field: "hex" },
		});
	});

	test("refuses a part that is not skin or hair", async () => {
		// Given: alice signed in, no mannequin row
		const { h, headers } = await withAccount();
		// When
		const res = await putColour(h, headers, "eyes", "#8D5524");
		// Then
		expect(await answer(res)).toEqual({
			status: 400,
			body: { error: "invalid", field: "part" },
		});
	});
});
