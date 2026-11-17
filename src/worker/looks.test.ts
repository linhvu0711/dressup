import { describe, expect, test } from "bun:test";
import { lookInputSchema } from "@/looks/look";
import { schema } from "./db";
import { changeLook, listLooks, saveLook } from "./look-store";
import { BOB, type Harness, withAccount } from "./test/harness";

const NAVY = {
	id: "11111111-1111-4111-8111-111111111111",
	modeId: "polo-sweater-harrington",
	name: "Navy day",
	colours: {
		chino_p: "#C9B38C",
		polo_l: "#F3F1EC",
		sweater: "#1F3A5F",
		harrington: "#55633F",
	},
	open: ["harrington"],
	tags: [],
};

const SECOND_ID = "22222222-2222-4222-8222-222222222222";

const post = ({ app, env }: Harness, headers: Headers, body: unknown) =>
	app.request(
		"/api/looks",
		{
			method: "POST",
			headers: {
				...Object.fromEntries(headers),
				"content-type": "application/json",
			},
			body: typeof body === "string" ? body : JSON.stringify(body),
		},
		env,
	);

const list = async ({ app, env }: Harness, headers: Headers) =>
	(await (await app.request("/api/looks", { headers }, env)).json()) as {
		looks: { name: string }[];
	};

const lookCount = async (h: Harness) => (await h.rows(schema.look)).length;

describe("POST /api/looks", () => {
	test("saves a look and lists it", async () => {
		// Given: alice signed in
		const { h, headers } = await withAccount();
		// When
		const saved = await post(h, headers, NAVY);
		const res = await h.app.request("/api/looks", { headers }, h.env);
		// Then
		expect({
			post: saved.status,
			get: res.status,
			body: await res.json(),
		}).toEqual({
			post: 201,
			get: 200,
			body: { looks: [NAVY] },
		});
	});

	test("saves a look once when the same save comes twice", async () => {
		// Given: alice signed in
		const { h, headers } = await withAccount();
		// When
		const first = await post(h, headers, NAVY);
		const second = await post(h, headers, NAVY);
		// Then
		expect({
			first: first.status,
			second: second.status,
			body: await second.json(),
			count: (await list(h, headers)).looks.length,
		}).toEqual({ first: 201, second: 200, body: { look: NAVY }, count: 1 });
	});

	test("stores the new name when the same save comes again with another name", async () => {
		// Given: alice saved NAVY
		const { h, headers } = await withAccount();
		await post(h, headers, NAVY);
		// When
		const res = await post(h, headers, { ...NAVY, name: "Navy night" });
		// Then
		expect({
			status: res.status,
			names: (await list(h, headers)).looks.map((l) => l.name),
		}).toEqual({ status: 200, names: ["Navy night"] });
	});

	test("refuses an id that another account saved", async () => {
		// Given: alice saved NAVY; bob signed in
		const { h, headers } = await withAccount();
		await post(h, headers, NAVY);
		const bob = await h.addAccount(BOB);
		// When
		const res = await post(h, bob, { ...NAVY, name: "Bob day" });
		// Then
		expect({
			status: res.status,
			body: await res.json(),
			alice: (await list(h, headers)).looks.map((l) => l.name),
		}).toEqual({
			status: 409,
			body: { error: "conflict", field: "id" },
			alice: ["Navy day"],
		});
	});

	test("refuses POST /api/looks without a session", async () => {
		// Given: alice, no session headers
		const { h } = await withAccount();
		// When
		const res = await post(h, new Headers(), NAVY);
		// Then
		expect({
			status: res.status,
			body: await res.json(),
			rows: await lookCount(h),
		}).toEqual({
			status: 401,
			body: { error: "unauthorized" },
			rows: 0,
		});
	});

	test("refuses a body that is not JSON", async () => {
		// Given: alice signed in; the body text `nope` in place of NAVY
		const { h, headers } = await withAccount();
		// When
		const res = await post(h, headers, "nope");
		// Then
		expect({ status: res.status, body: await res.json() }).toEqual({
			status: 400,
			body: { error: "invalid", field: "body" },
		});
	});

	test("refuses an id that is not a UUID", async () => {
		// Given: NAVY with another id
		const { h, headers } = await withAccount();
		// When
		const res = await post(h, headers, { ...NAVY, id: "look-1" });
		// Then
		expect({ status: res.status, body: await res.json() }).toEqual({
			status: 400,
			body: { error: "invalid", field: "id" },
		});
	});

	test("refuses an unknown mode", async () => {
		// Given: NAVY with an unknown mode
		const { h, headers } = await withAccount();
		// When
		const res = await post(h, headers, { ...NAVY, modeId: "polo-jumper" });
		// Then
		expect({ status: res.status, body: await res.json() }).toEqual({
			status: 400,
			body: { error: "invalid", field: "modeId" },
		});
	});

	test("refuses a code that is not a hex colour", async () => {
		// Given: NAVY with a sweater colour that is not a hex code
		const { h, headers } = await withAccount();
		// When
		const res = await post(h, headers, {
			...NAVY,
			colours: { ...NAVY.colours, sweater: "navy" },
		});
		// Then
		expect({ status: res.status, body: await res.json() }).toEqual({
			status: 400,
			body: { error: "invalid", field: "colours.sweater" },
		});
	});

	test("takes a name of 60 characters", async () => {
		// Given: NAVY with a name of 60 characters
		const { h, headers } = await withAccount();
		// When
		const res = await post(h, headers, { ...NAVY, name: "x".repeat(60) });
		// Then
		const body = (await res.json()) as { look: { name: string } };
		expect({ status: res.status, name: body.look.name }).toEqual({
			status: 201,
			name: "x".repeat(60),
		});
	});

	test("refuses a name of 61 characters", async () => {
		// Given: NAVY with a name of 61 characters
		const { h, headers } = await withAccount();
		// When
		const res = await post(h, headers, { ...NAVY, name: "x".repeat(61) });
		// Then
		expect({ status: res.status, body: await res.json() }).toEqual({
			status: 400,
			body: { error: "invalid", field: "name" },
		});
	});
});

describe("POST /api/looks against the mode", () => {
	test("refuses a garment that is not in the mode", async () => {
		// Given: NAVY with a tee colour, and the mode has no tee
		const { h, headers } = await withAccount();
		// When
		const res = await post(h, headers, {
			...NAVY,
			colours: { ...NAVY.colours, tee_s: "#FFFFFF" },
		});
		// Then
		expect({ status: res.status, body: await res.json() }).toEqual({
			status: 400,
			body: { error: "invalid", field: "colours.tee_s" },
		});
	});

	test("refuses a mode garment with no colour", async () => {
		// Given: NAVY with the long polo's colour taken out
		const { h, headers } = await withAccount();
		const { polo_l: _, ...colours } = NAVY.colours;
		// When
		const res = await post(h, headers, { ...NAVY, colours });
		// Then
		expect({ status: res.status, body: await res.json() }).toEqual({
			status: 400,
			body: { error: "invalid", field: "colours.polo_l" },
		});
	});

	test("refuses an open jacket that is not in the mode", async () => {
		// Given: NAVY with the wool jacket open, and the mode has no wool jacket
		const { h, headers } = await withAccount();
		// When
		const res = await post(h, headers, { ...NAVY, open: ["wool"] });
		// Then
		expect({ status: res.status, body: await res.json() }).toEqual({
			status: 400,
			body: { error: "invalid", field: "open" },
		});
	});
});

describe("POST /api/looks at the look limit", () => {
	test("refuses look number 301", async () => {
		// Given: alice signed in with 300 looks
		const { h, headers } = await withAccount();
		await h.seedLooks("alice-id", 300);
		// When
		const res = await post(h, headers, NAVY);
		// Then
		expect({
			status: res.status,
			body: await res.json(),
			count: await lookCount(h),
		}).toEqual({
			status: 409,
			body: { error: "look_limit" },
			count: 300,
		});
	});

	test("saves look number 300", async () => {
		// Given: alice signed in with 299 looks
		const { h, headers } = await withAccount();
		await h.seedLooks("alice-id", 299);
		// When
		const res = await post(h, headers, NAVY);
		// Then
		expect({ status: res.status, count: await lookCount(h) }).toEqual({
			status: 201,
			count: 300,
		});
	});

	test("changes a look at the limit", async () => {
		// Given: alice saved NAVY and has 300 looks
		const { h, headers } = await withAccount();
		await post(h, headers, NAVY);
		await h.seedLooks("alice-id", 299);
		// When
		const res = await post(h, headers, { ...NAVY, name: "Navy night" });
		// Then
		expect({
			status: res.status,
			name: ((await res.json()) as { look: { name: string } }).look.name,
			count: await lookCount(h),
		}).toEqual({ status: 200, name: "Navy night", count: 300 });
	});
});

describe("GET /api/looks", () => {
	test("lists the newest look first", async () => {
		// Given: alice saved "First", then "Second", one right after the other
		const { h, headers } = await withAccount();
		await post(h, headers, { ...NAVY, name: "First" });
		await post(h, headers, { ...NAVY, id: SECOND_ID, name: "Second" });
		// When
		const { looks } = await list(h, headers);
		// Then
		expect(looks.map((l) => l.name)).toEqual(["Second", "First"]);
	});

	test("refuses GET /api/looks without a session", async () => {
		// Given: alice saved NAVY; no session headers
		const { h, headers } = await withAccount();
		await post(h, headers, NAVY);
		// When
		const res = await h.app.request("/api/looks", {}, h.env);
		// Then
		expect({ status: res.status, body: await res.json() }).toEqual({
			status: 401,
			body: { error: "unauthorized" },
		});
	});

	test("lists only the account's own looks", async () => {
		// Given: alice saved NAVY; bob signed in
		const { h, headers } = await withAccount();
		await post(h, headers, NAVY);
		const bob = await h.addAccount(BOB);
		// When
		const res = await h.app.request("/api/looks", { headers: bob }, h.env);
		// Then
		expect({ status: res.status, body: await res.json() }).toEqual({
			status: 200,
			body: { looks: [] },
		});
	});
});

const NAVY_PATH = `/api/looks/${NAVY.id}`;

const remove = ({ app, env }: Harness, headers: Headers, path = NAVY_PATH) =>
	app.request(path, { method: "DELETE", headers }, env);

const names = async (h: Harness, headers: Headers) =>
	(await list(h, headers)).looks.map((l) => l.name);

describe("DELETE /api/looks/:id", () => {
	test("deletes a look", async () => {
		// Given: alice saved NAVY
		const { h, headers } = await withAccount();
		await post(h, headers, NAVY);
		// When
		const res = await remove(h, headers);
		// Then
		expect({
			status: res.status,
			looks: (await list(h, headers)).looks,
		}).toEqual({ status: 204, looks: [] });
	});

	test("answers 404 when the same delete comes twice", async () => {
		// Given: alice saved NAVY
		const { h, headers } = await withAccount();
		await post(h, headers, NAVY);
		// When
		const first = await remove(h, headers);
		const second = await remove(h, headers);
		// Then
		expect({
			statuses: [first.status, second.status],
			body: await second.json(),
			looks: (await list(h, headers)).looks,
		}).toEqual({
			statuses: [204, 404],
			body: { error: "not_found" },
			looks: [],
		});
	});

	test("answers 404 for a delete of another account's look", async () => {
		// Given: alice saved NAVY; bob is signed in too
		const { h, headers } = await withAccount();
		await post(h, headers, NAVY);
		const bob = await h.addAccount(BOB);
		// When
		const res = await remove(h, bob);
		// Then
		expect({
			status: res.status,
			body: await res.json(),
			aliceNames: await names(h, headers),
		}).toEqual({
			status: 404,
			body: { error: "not_found" },
			aliceNames: ["Navy day"],
		});
	});

	test("refuses DELETE /api/looks/:id without a session", async () => {
		// Given: alice saved NAVY; no session headers
		const { h, headers } = await withAccount();
		await post(h, headers, NAVY);
		// When
		const res = await remove(h, new Headers());
		// Then
		expect({
			status: res.status,
			body: await res.json(),
			rows: await lookCount(h),
		}).toEqual({
			status: 401,
			body: { error: "unauthorized" },
			rows: 1,
		});
	});
});

const put = (
	{ app, env }: Harness,
	headers: Headers,
	body: unknown,
	path = NAVY_PATH,
) =>
	app.request(
		path,
		{
			method: "PUT",
			headers: {
				...Object.fromEntries(headers),
				"content-type": "application/json",
			},
			body: JSON.stringify(body),
		},
		env,
	);

const NAVY_NIGHT = {
	...NAVY,
	name: "Navy night",
	colours: { ...NAVY.colours, sweater: "#7A2E2E" },
};

async function aliceWithTwoLooks() {
	const { h, headers } = await withAccount();
	await post(h, headers, NAVY);
	await post(h, headers, { ...NAVY, id: SECOND_ID, name: "Second" });
	return { h, headers };
}

describe("PUT /api/looks/:id", () => {
	test("changes a look and keeps its place", async () => {
		// Given: alice saved NAVY, then a second look
		const { h, headers } = await aliceWithTwoLooks();
		// When
		const res = await put(h, headers, NAVY_NIGHT);
		// Then
		expect({
			status: res.status,
			body: await res.json(),
			names: await names(h, headers),
		}).toEqual({
			status: 200,
			body: { look: NAVY_NIGHT },
			names: ["Second", "Navy night"],
		});
	});

	test("changes a look once when the same change comes twice", async () => {
		// Given: alice saved NAVY
		const { h, headers } = await withAccount();
		await post(h, headers, NAVY);
		// When
		const first = await put(h, headers, NAVY_NIGHT);
		const second = await put(h, headers, NAVY_NIGHT);
		// Then
		expect({
			statuses: [first.status, second.status],
			names: await names(h, headers),
			rows: await lookCount(h),
		}).toEqual({
			statuses: [200, 200],
			names: ["Navy night"],
			rows: 1,
		});
	});

	test("refuses a changed look with a code that is not a hex colour", async () => {
		// Given: alice saved two looks; the change with a lower-case code
		const { h, headers } = await aliceWithTwoLooks();
		// When
		const res = await put(h, headers, {
			...NAVY_NIGHT,
			colours: { ...NAVY_NIGHT.colours, sweater: "#7a2e2e" },
		});
		// Then
		expect({
			status: res.status,
			body: await res.json(),
			names: await names(h, headers),
		}).toEqual({
			status: 400,
			body: { error: "invalid", field: "colours.sweater" },
			names: ["Second", "Navy day"],
		});
	});

	test("refuses a changed look whose id is not the one in the path", async () => {
		// Given: alice saved two looks; the change with the second look's id
		const { h, headers } = await aliceWithTwoLooks();
		// When
		const res = await put(h, headers, { ...NAVY_NIGHT, id: SECOND_ID });
		// Then
		expect({
			status: res.status,
			body: await res.json(),
			names: await names(h, headers),
		}).toEqual({
			status: 400,
			body: { error: "invalid", field: "id" },
			names: ["Second", "Navy day"],
		});
	});

	test("answers 404 for a look that is gone", async () => {
		// Given: alice saved NAVY, then deleted it
		const { h, headers } = await withAccount();
		await post(h, headers, NAVY);
		await remove(h, headers);
		// When
		const res = await put(h, headers, NAVY_NIGHT);
		// Then
		expect({
			status: res.status,
			body: await res.json(),
			looks: (await list(h, headers)).looks,
		}).toEqual({ status: 404, body: { error: "not_found" }, looks: [] });
	});

	test("answers 404 for a change to another account's look", async () => {
		// Given: alice saved NAVY; bob is signed in too
		const { h, headers } = await withAccount();
		await post(h, headers, NAVY);
		const bob = await h.addAccount(BOB);
		// When
		const res = await put(h, bob, NAVY_NIGHT);
		// Then
		expect({
			status: res.status,
			body: await res.json(),
			aliceNames: await names(h, headers),
		}).toEqual({
			status: 404,
			body: { error: "not_found" },
			aliceNames: ["Navy day"],
		});
	});

	test("refuses PUT /api/looks/:id without a session", async () => {
		// Given: alice saved NAVY; no session headers
		const { h, headers } = await withAccount();
		await post(h, headers, NAVY);
		// When
		const res = await put(h, new Headers(), NAVY_NIGHT);
		// Then
		expect({
			status: res.status,
			body: await res.json(),
			names: await names(h, headers),
		}).toEqual({
			status: 401,
			body: { error: "unauthorized" },
			names: ["Navy day"],
		});
	});
});

describe("look rows", () => {
	test("deletes the looks with their user", async () => {
		// Given: alice saved two looks
		const { h, headers } = await withAccount();
		await post(h, headers, NAVY);
		await post(h, headers, { ...NAVY, id: SECOND_ID });
		// When
		await h.helpers.deleteUser("alice-id");
		// Then
		expect(await lookCount(h)).toBe(0);
	});
});

const addTag = async ({ app, env }: Harness, headers: Headers, name: string) =>
	(
		(await (
			await app.request(
				"/api/tags",
				{
					method: "POST",
					headers: {
						...Object.fromEntries(headers),
						"content-type": "application/json",
					},
					body: JSON.stringify({ name }),
				},
				env,
			)
		).json()) as { tag: { id: string } }
	).tag.id;

const tagsOfLook = async (res: Response) =>
	((await res.json()) as { look: { tags: string[] } }).look.tags;

const links = async (h: Harness, userId: string) =>
	(await h.rows(schema.lookTag, userId)).length;

describe("tags on looks", () => {
	test("saves a look with two tags and lists them in the order they were made", async () => {
		// Given: alice signed in; tags "Work" then "Trip" posted
		const { h, headers } = await withAccount();
		const work = await addTag(h, headers, "Work");
		const trip = await addTag(h, headers, "Trip");
		// When
		await post(h, headers, { ...NAVY, tags: [trip, work] });
		const { looks } = (await list(h, headers)) as unknown as {
			looks: { tags: string[] }[];
		};
		// Then
		expect(looks[0]?.tags).toEqual([work, trip]);
	});

	test("drops a tag of another account from a look", async () => {
		// Given: bob posted tag "Trip"; alice signed in with tag "Work"
		const { h, headers } = await withAccount();
		const bob = await h.addAccount(BOB);
		const bobTrip = await addTag(h, bob, "Trip");
		const work = await addTag(h, headers, "Work");
		// When
		const res = await post(h, headers, { ...NAVY, tags: [work, bobTrip] });
		// Then
		expect({
			status: res.status,
			tags: await tagsOfLook(res),
			bobLinks: await links(h, "bob-id"),
		}).toEqual({ status: 201, tags: [work], bobLinks: 0 });
	});

	test("replaces a look's tags on a change", async () => {
		// Given: alice saved NAVY with "Work"; tag "Trip" posted
		const { h, headers } = await withAccount();
		const work = await addTag(h, headers, "Work");
		await post(h, headers, { ...NAVY, tags: [work] });
		const trip = await addTag(h, headers, "Trip");
		// When
		const res = await put(h, headers, { ...NAVY, tags: [trip] });
		// Then
		expect({ status: res.status, tags: await tagsOfLook(res) }).toEqual({
			status: 200,
			tags: [trip],
		});
	});

	test("saves a look's tags once when the same save comes twice", async () => {
		// Given: alice signed in with tag "Work"
		const { h, headers } = await withAccount();
		const work = await addTag(h, headers, "Work");
		// When
		await post(h, headers, { ...NAVY, tags: [work] });
		const second = await post(h, headers, { ...NAVY, tags: [work] });
		// Then
		expect({
			second: second.status,
			tags: await tagsOfLook(second),
			links: await links(h, "alice-id"),
		}).toEqual({ second: 200, tags: [work], links: 1 });
	});

	test("refuses a look with 51 tags", async () => {
		// Given: alice signed in
		const { h, headers } = await withAccount();
		const tags = Array.from(
			{ length: 51 },
			(_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
		);
		// When
		const res = await post(h, headers, { ...NAVY, tags });
		// Then
		expect({ status: res.status, body: await res.json() }).toEqual({
			status: 400,
			body: { error: "invalid", field: "tags" },
		});
	});
});

describe("two look changes made from one read", () => {
	test("keeps both of two look changes made from one read", async () => {
		// Given: NAVY saved, and the one read both changes make before either
		// writes. Two calls through the harness do not overlap, so the test
		// sets the order itself.
		const { h } = await withAccount();
		const { db } = h;
		await saveLook(db, "alice-id", lookInputSchema.parse(NAVY));
		const [read] = await listLooks(db, "alice-id");
		// When
		await changeLook(
			db,
			"alice-id",
			NAVY.id,
			{ name: "Navy night" },
			read.modeId,
		);
		await changeLook(
			db,
			"alice-id",
			NAVY.id,
			{ colours: { sweater: "#7A2E2E" } },
			read.modeId,
		);
		// Then
		const [look] = await listLooks(db, "alice-id");
		expect({
			name: look.name,
			sweater: look.colours.sweater,
			chino_p: look.colours.chino_p,
		}).toEqual({ name: "Navy night", sweater: "#7A2E2E", chino_p: "#C9B38C" });
	});
});

describe("two look saves at once", () => {
	test("saves one of two looks sent at once at look 299", async () => {
		// Given
		const { h } = await withAccount();
		await h.seedLooks("alice-id", 299);
		const first = lookInputSchema.parse({ ...NAVY, id: SECOND_ID });
		const second = lookInputSchema.parse({
			...NAVY,
			id: "33333333-3333-4333-8333-333333333333",
		});
		// When
		const results = await Promise.all([
			saveLook(h.db, "alice-id", first),
			saveLook(h.db, "alice-id", second),
		]);
		// Then
		expect({
			count: await lookCount(h),
			oks: results.map((r) => r.ok).sort(),
		}).toEqual({ count: 300, oks: [false, true] });
	});
});
