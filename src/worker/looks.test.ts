import { describe, expect, test } from "bun:test";
import { makeHarness } from "./test/harness";

type Harness = Awaited<ReturnType<typeof makeHarness>>;

async function withUser(id: string, email: string, name: string) {
	const h = await makeHarness();
	await h.helpers.saveUser(h.helpers.createUser({ id, email, name }));
	return h;
}

const withAlice = () => withUser("alice-id", "alice@example.com", "Alice");

async function aliceSignedIn() {
	const h = await withAlice();
	const headers = await h.helpers.getAuthHeaders({ userId: "alice-id" });
	return { h, headers };
}

async function withBob(h: Harness) {
	await h.helpers.saveUser(
		h.helpers.createUser({
			id: "bob-id",
			email: "bob@example.com",
			name: "Bob",
		}),
	);
	return h.helpers.getAuthHeaders({ userId: "bob-id" });
}

const NAVY = {
	id: "11111111-1111-4111-8111-111111111111",
	modeId: "polo-sweater-chore",
	name: "Navy day",
	colours: {
		chino_p: "#C9B38C",
		polo_l: "#F3F1EC",
		sweater: "#1F3A5F",
		chore: "#55633F",
	},
	open: ["chore"],
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

describe("POST /api/looks", () => {
	test("saves a look and lists it", async () => {
		// Given: alice signed in
		const { h, headers } = await aliceSignedIn();
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
		const { h, headers } = await aliceSignedIn();
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
		const { h, headers } = await aliceSignedIn();
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
		const { h, headers } = await aliceSignedIn();
		await post(h, headers, NAVY);
		const bob = await withBob(h);
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
		const h = await withAlice();
		// When
		const res = await post(h, new Headers(), NAVY);
		// Then
		expect({
			status: res.status,
			body: await res.json(),
			rows: h.sqlite.query("select count(*) as n from look").get(),
		}).toEqual({
			status: 401,
			body: { error: "unauthorized" },
			rows: { n: 0 },
		});
	});

	test("refuses a body that is not JSON", async () => {
		// Given: alice signed in; the body text `nope` in place of NAVY
		const { h, headers } = await aliceSignedIn();
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
		const { h, headers } = await aliceSignedIn();
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
		const { h, headers } = await aliceSignedIn();
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
		const { h, headers } = await aliceSignedIn();
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
		const { h, headers } = await aliceSignedIn();
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
		const { h, headers } = await aliceSignedIn();
		// When
		const res = await post(h, headers, { ...NAVY, name: "x".repeat(61) });
		// Then
		expect({ status: res.status, body: await res.json() }).toEqual({
			status: 400,
			body: { error: "invalid", field: "name" },
		});
	});
});

describe("GET /api/looks", () => {
	test("lists the newest look first", async () => {
		// Given: alice saved "First", then "Second", one right after the other
		const { h, headers } = await aliceSignedIn();
		await post(h, headers, { ...NAVY, name: "First" });
		await post(h, headers, { ...NAVY, id: SECOND_ID, name: "Second" });
		// When
		const { looks } = await list(h, headers);
		// Then
		expect(looks.map((l) => l.name)).toEqual(["Second", "First"]);
	});

	test("refuses GET /api/looks without a session", async () => {
		// Given: alice saved NAVY; no session headers
		const { h, headers } = await aliceSignedIn();
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
		const { h, headers } = await aliceSignedIn();
		await post(h, headers, NAVY);
		const bob = await withBob(h);
		// When
		const res = await h.app.request("/api/looks", { headers: bob }, h.env);
		// Then
		expect({ status: res.status, body: await res.json() }).toEqual({
			status: 200,
			body: { looks: [] },
		});
	});
});

describe("look rows", () => {
	test("deletes the looks with their user", async () => {
		// Given: alice saved two looks
		const { h, headers } = await aliceSignedIn();
		await post(h, headers, NAVY);
		await post(h, headers, { ...NAVY, id: SECOND_ID });
		// When
		h.sqlite.run("delete from user where id = 'alice-id'");
		// Then
		expect(h.sqlite.query("select count(*) as n from look").get()).toEqual({
			n: 0,
		});
	});
});
