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
