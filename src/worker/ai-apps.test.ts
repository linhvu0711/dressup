import { afterEach, describe, expect, test } from "bun:test";
import {
	connectAiApp,
	cookie,
	makeHarness,
	stubOutside,
	TEST_APP_ID,
	testAppDocument,
} from "./test/harness";

type Harness = Awaited<ReturnType<typeof makeHarness>>;

const send = (
	h: Harness,
	method: string,
	path: string,
	headers: HeadersInit = {},
) => h.app.request(path, { method, headers }, h.env);

const count = (h: Harness, table: string) =>
	(h.sqlite.query(`select count(*) as n from ${table}`).get() as { n: number })
		.n;

// An MCP initialize with the app's pass, as src/worker/mcp.test.ts sends it.
const initialize = (h: Harness, bearer: string) =>
	h.app.request(
		"/api/mcp",
		{
			method: "POST",
			headers: {
				"content-type": "application/json",
				accept: "application/json, text/event-stream",
				authorization: `Bearer ${bearer}`,
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "initialize",
				params: {
					protocolVersion: "2025-11-25",
					capabilities: {},
					clientInfo: { name: "test", version: "1" },
				},
			}),
		},
		h.env,
	);

describe("/api/ai-apps", () => {
	let outside: ReturnType<typeof stubOutside> | undefined;
	afterEach(() => outside?.restore());

	// Alice connected the test app on 2026-11-14 at 12:00 UTC; its allow row
	// has the fixed id "allow-1".
	async function aliceConnected() {
		const h = await makeHarness();
		outside = stubOutside({
			google: {
				sub: "g-alice",
				email: "alice@example.com",
				name: "Alice",
				picture: "https://example.com/a.png",
			},
			documents: { [TEST_APP_ID]: testAppDocument },
		});
		const { jar, token } = await connectAiApp(h, { accept: true });
		h.sqlite.run(
			"update oauth_consent set id = 'allow-1', created_at = 1794657600000",
		);
		return {
			h,
			alice: { cookie: cookie(jar) },
			bearer: token?.body.access_token ?? "",
		};
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

	test("lists a connected AI app with its name, logo, and connect date", async () => {
		// Given
		const { h, alice } = await aliceConnected();
		// When
		const res = await send(h, "GET", "/api/ai-apps", alice);
		// Then
		expect({ status: res.status, body: await res.json() }).toEqual({
			status: 200,
			body: {
				apps: [
					{
						id: "allow-1",
						name: "Test App",
						logo: "https://client.example/logo.png",
						connectedAt: "2026-11-14T12:00:00.000Z",
					},
				],
			},
		});
	});

	test("names an AI app with no name by its client id", async () => {
		// Given: the app's document gave no name and no logo
		const { h, alice } = await aliceConnected();
		h.sqlite.run("update oauth_client set name = null, icon = null");
		// When
		const res = await send(h, "GET", "/api/ai-apps", alice);
		// Then
		expect(await res.json()).toEqual({
			apps: [
				{
					id: "allow-1",
					name: "https://client.example/meta.json",
					logo: null,
					connectedAt: "2026-11-14T12:00:00.000Z",
				},
			],
		});
	});

	test("lists only the account's own AI apps", async () => {
		// Given: alice connected the app; bob signed in
		const { h } = await aliceConnected();
		const bob = await withBob(h);
		// When
		const res = await send(h, "GET", "/api/ai-apps", bob);
		// Then
		expect({ status: res.status, body: await res.json() }).toEqual({
			status: 200,
			body: { apps: [] },
		});
	});

	test("disconnects an AI app and refuses its next MCP call", async () => {
		// Given
		const { h, alice, bearer } = await aliceConnected();
		// When
		const res = await send(h, "DELETE", "/api/ai-apps/allow-1", alice);
		// Then
		const list = await send(h, "GET", "/api/ai-apps", alice);
		const mcp = await initialize(h, bearer);
		expect({
			status: res.status,
			allows: count(h, "oauth_consent"),
			refreshTokens: count(h, "oauth_refresh_token"),
			apps: ((await list.json()) as { apps: unknown[] }).apps,
			mcp: mcp.status,
		}).toEqual({
			status: 204,
			allows: 0,
			refreshTokens: 0,
			apps: [],
			mcp: 401,
		});
	});

	test("answers 404 for a disconnect of another account's AI app", async () => {
		// Given: alice connected the app; bob signed in
		const { h } = await aliceConnected();
		const bob = await withBob(h);
		// When
		const res = await send(h, "DELETE", "/api/ai-apps/allow-1", bob);
		// Then
		expect({
			status: res.status,
			body: await res.json(),
			allows: count(h, "oauth_consent"),
			refreshTokens: count(h, "oauth_refresh_token"),
		}).toEqual({
			status: 404,
			body: { error: "not_found" },
			allows: 1,
			refreshTokens: 1,
		});
	});

	test("answers 404 when the same disconnect comes twice", async () => {
		// Given
		const { h, alice } = await aliceConnected();
		// When
		const first = await send(h, "DELETE", "/api/ai-apps/allow-1", alice);
		const second = await send(h, "DELETE", "/api/ai-apps/allow-1", alice);
		// Then
		expect({
			first: first.status,
			second: second.status,
			allows: count(h, "oauth_consent"),
			refreshTokens: count(h, "oauth_refresh_token"),
		}).toEqual({ first: 204, second: 404, allows: 0, refreshTokens: 0 });
	});

	test("keeps the tokens of other AI apps and other accounts", async () => {
		// Given: alice also holds a token of another app; bob holds one of the
		// test app. The Google sign-in gives alice a random id.
		const { h, alice } = await aliceConnected();
		await withBob(h);
		const { id: aliceId } = h.sqlite
			.query("select id from user where email = 'alice@example.com'")
			.get() as { id: string };
		h.sqlite.run(
			`insert into oauth_client (id, client_id, redirect_uris)
			 values ('other', 'https://other.example/meta.json', '["http://127.0.0.1/callback"]')`,
		);
		const insertToken = h.sqlite.prepare(
			`insert into oauth_refresh_token
			 (id, token, client_id, user_id, expires_at, created_at, scopes)
			 values (?, ?, ?, ?, 1894657600000, 1794657600000, '["openid"]')`,
		);
		insertToken.run(
			"rt-alice-other",
			"token-alice-other",
			"https://other.example/meta.json",
			aliceId,
		);
		insertToken.run("rt-bob-test", "token-bob-test", TEST_APP_ID, "bob-id");
		// When
		await send(h, "DELETE", "/api/ai-apps/allow-1", alice);
		// Then
		const left = h.sqlite
			.query("select id from oauth_refresh_token order by id")
			.all() as { id: string }[];
		expect(left.map((row) => row.id)).toEqual([
			"rt-alice-other",
			"rt-bob-test",
		]);
	});

	test("refuses DELETE /api/ai-apps/:id without a session", async () => {
		// Given
		const { h } = await aliceConnected();
		// When
		const res = await send(h, "DELETE", "/api/ai-apps/allow-1");
		// Then
		expect({
			status: res.status,
			body: await res.json(),
			allows: count(h, "oauth_consent"),
		}).toEqual({ status: 401, body: { error: "unauthorized" }, allows: 1 });
	});

	test("refuses GET /api/ai-apps without a session", async () => {
		// Given
		const { h } = await aliceConnected();
		// When
		const res = await send(h, "GET", "/api/ai-apps");
		// Then
		expect({ status: res.status, body: await res.json() }).toEqual({
			status: 401,
			body: { error: "unauthorized" },
		});
	});
});
