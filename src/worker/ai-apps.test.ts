import { describe, expect, test } from "bun:test";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import { schema } from "./db";
import {
	BOB,
	cookie,
	type Harness,
	INITIALIZE,
	post,
	TEST_APP_ID,
	withAiApp,
} from "./test/harness";

const send = (
	h: Harness,
	method: string,
	path: string,
	headers: HeadersInit = {},
) => h.app.request(path, { method, headers }, h.env);

const count = async (h: Harness, table: SQLiteTable) =>
	(await h.rows(table)).length;

describe("/api/ai-apps", () => {
	// Alice connected the test app on 2026-11-14 at 12:00 UTC; its allow row
	// has the fixed id "allow-1".
	async function aliceConnected() {
		const { h, jar, bearer, userId } = await withAiApp();
		await h.db
			.update(schema.oauthConsent)
			.set({ id: "allow-1", createdAt: new Date(1794657600000) });
		return {
			h,
			alice: { cookie: cookie(jar) },
			bearer,
			userId,
		};
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
		await h.db.update(schema.oauthClient).set({ name: null, icon: null });
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
		const bob = await h.addAccount(BOB);
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
		const mcp = await post(h, INITIALIZE, bearer);
		expect({
			status: res.status,
			allows: await count(h, schema.oauthConsent),
			refreshTokens: await count(h, schema.oauthRefreshToken),
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
		const bob = await h.addAccount(BOB);
		// When
		const res = await send(h, "DELETE", "/api/ai-apps/allow-1", bob);
		// Then
		expect({
			status: res.status,
			body: await res.json(),
			allows: await count(h, schema.oauthConsent),
			refreshTokens: await count(h, schema.oauthRefreshToken),
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
			allows: await count(h, schema.oauthConsent),
			refreshTokens: await count(h, schema.oauthRefreshToken),
		}).toEqual({ first: 204, second: 404, allows: 0, refreshTokens: 0 });
	});

	test("keeps the tokens of other AI apps and other accounts", async () => {
		// Given: alice also holds a token of another app; bob holds one of the
		// test app. The Google sign-in gives alice a random id.
		const { h, alice, userId: aliceId } = await aliceConnected();
		await h.addAccount(BOB);
		await h.db.insert(schema.oauthClient).values({
			id: "other",
			clientId: "https://other.example/meta.json",
			redirectUris: ["http://127.0.0.1/callback"],
		});
		const token = (id: string, clientId: string, userId: string) => ({
			id,
			token: `token-${id}`,
			clientId,
			userId,
			expiresAt: new Date(1894657600000),
			createdAt: new Date(1794657600000),
			scopes: ["openid"],
		});
		await h.db
			.insert(schema.oauthRefreshToken)
			.values([
				token("rt-alice-other", "https://other.example/meta.json", aliceId),
				token("rt-bob-test", TEST_APP_ID, "bob-id"),
			]);
		// When
		await send(h, "DELETE", "/api/ai-apps/allow-1", alice);
		// Then
		const left = (await h.rows(schema.oauthRefreshToken))
			.map((row) => row.id)
			.sort();
		expect(left).toEqual(["rt-alice-other", "rt-bob-test"]);
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
			allows: await count(h, schema.oauthConsent),
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
