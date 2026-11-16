import { afterEach, describe, expect, test } from "bun:test";
import type { BetterAuthOptions } from "better-auth";
import { createApp } from "./app";
import { type Auth, authOptions, createAuthCache } from "./auth";
import {
	cookie,
	finishGoogleSignIn,
	makeHarness,
	startGoogleSignIn,
	stubOutside,
} from "./test/harness";

async function withUser(id: string, email: string, name: string) {
	const h = await makeHarness();
	await h.helpers.saveUser(h.helpers.createUser({ id, email, name }));
	return h;
}

describe("GET /api/me", () => {
	test("returns the signed-in user on GET /api/me", async () => {
		// Given: alice, signed in
		const { app, env, helpers } = await withUser(
			"alice-id",
			"alice@example.com",
			"Alice",
		);
		const headers = await helpers.getAuthHeaders({ userId: "alice-id" });
		// When
		const res = await app.request("/api/me", { headers }, env);
		// Then
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			id: "alice-id",
			name: "Alice",
			email: "alice@example.com",
			image: null,
		});
	});

	test("refuses GET /api/me without a session", async () => {
		// Given: alice saved, but no session headers
		const { app, env } = await withUser(
			"alice-id",
			"alice@example.com",
			"Alice",
		);
		// When
		const res = await app.request("/api/me", {}, env);
		// Then
		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({ error: "unauthorized" });
	});

	test("gives each session only its own user", async () => {
		// Given: alice and bob, each signed in
		const { app, env, helpers } = await withUser(
			"alice-id",
			"alice@example.com",
			"Alice",
		);
		await helpers.saveUser(
			helpers.createUser({
				id: "bob-id",
				email: "bob@example.com",
				name: "Bob",
			}),
		);
		const aliceHeaders = await helpers.getAuthHeaders({ userId: "alice-id" });
		const bobHeaders = await helpers.getAuthHeaders({ userId: "bob-id" });
		// When
		const alice = await app.request("/api/me", { headers: aliceHeaders }, env);
		const bob = await app.request("/api/me", { headers: bobHeaders }, env);
		// Then
		type Me = { id: string; email: string };
		const bodies = [(await alice.json()) as Me, (await bob.json()) as Me];
		const seen = bodies.map((u) => ({
			id: u.id,
			email: u.email,
		}));
		expect(seen).toEqual([
			{ id: "alice-id", email: "alice@example.com" },
			{ id: "bob-id", email: "bob@example.com" },
		]);
	});
});

describe("migrations", () => {
	test("makes the auth, dress, look, and tag tables from the migrations", async () => {
		// Given
		const { sqlite } = await makeHarness();
		// When
		const rows = sqlite
			.query<{ name: string }, []>(
				"select name from sqlite_master where type = 'table' order by name",
			)
			.all();
		// Then
		expect(rows.map((r) => r.name)).toEqual([
			"__drizzle_migrations",
			"account",
			"ai_action_count",
			"colour_square",
			"jwks",
			"look",
			"look_tag",
			"mannequin",
			"oauth_access_token",
			"oauth_client",
			"oauth_client_assertion",
			"oauth_client_resource",
			"oauth_consent",
			"oauth_refresh_token",
			"oauth_resource",
			"outfit",
			"outfit_garment",
			"session",
			"tag",
			"user",
			"verification",
		]);
	});
});

type Harness = Awaited<ReturnType<typeof makeHarness>>;

const signIn = async (h: Harness) =>
	finishGoogleSignIn(h, await startGoogleSignIn(h));

describe("Google sign-in", () => {
	let restore = () => {};
	afterEach(() => restore());

	test("sends sign-in to Google with our callback address", async () => {
		// Given
		const h = await makeHarness();
		// When
		const { res, google } = await startGoogleSignIn(h);
		// Then
		expect(res.status).toBe(200);
		expect({
			origin: google.origin,
			path: google.pathname,
			clientId: google.searchParams.get("client_id"),
			redirectUri: google.searchParams.get("redirect_uri"),
		}).toEqual({
			origin: "https://accounts.google.com",
			path: "/o/oauth2/v2/auth",
			clientId: "test-client",
			redirectUri: "http://localhost:5173/api/auth/callback/google",
		});
	});

	test("sends a cancelled Google sign-in back with the error", async () => {
		// Given: a started sign-in, its state and its state cookie
		const h = await makeHarness();
		const { state, jar } = await startGoogleSignIn(h);
		// When
		const res = await h.app.request(
			`/api/auth/callback/google?error=access_denied&state=${state}`,
			{ headers: { cookie: cookie(jar) }, redirect: "manual" },
			h.env,
		);
		// Then
		expect(res.status).toBe(302);
		expect(res.headers.get("location")).toBe("/?error=access_denied");
	});

	test("makes one user on the first Google sign-in and reuses it", async () => {
		// Given
		const h = await makeHarness();
		restore = stubOutside({
			google: {
				sub: "g-123",
				email: "carol@example.com",
				name: "Carol",
				picture: "https://example.com/c.png",
			},
		}).restore;
		// When
		const { res: first, jar } = await signIn(h);
		const me = await h.app.request(
			"/api/me",
			{ headers: { cookie: cookie(jar) } },
			h.env,
		);
		const { res: second, jar: secondJar } = await signIn(h);
		// Then
		const ids = h.sqlite.query<{ id: string }, []>("select id from user").all();
		const accounts = h.sqlite
			.query<{ provider_id: string; account_id: string }, []>(
				"select provider_id, account_id from account",
			)
			.all();
		const meBody = (await me.json()) as {
			id: string;
			name: string;
			email: string;
			image: string | null;
		};
		expect({
			first: [first.status, first.headers.get("location")],
			second: [second.status, second.headers.get("location")],
			sessionCookie: secondJar.has("better-auth.session_token"),
			me: meBody,
			users: ids.length,
			sameUser: ids[0]?.id === meBody.id,
			accounts,
		}).toEqual({
			first: [302, "/"],
			second: [302, "/"],
			sessionCookie: true,
			me: {
				id: meBody.id,
				name: "Carol",
				email: "carol@example.com",
				image: "https://example.com/c.png",
			},
			users: 1,
			sameUser: true,
			accounts: [{ provider_id: "google", account_id: "g-123" }],
		});
	});

	test("turns on Google sign-in and the AI app sign-in server only", async () => {
		// Given
		const { settings } = await makeHarness();
		// When
		const options: BetterAuthOptions = authOptions(settings);
		// Then
		expect({
			providers: Object.keys(options.socialProviders ?? {}),
			plugins: options.plugins?.map((plugin) => plugin.id),
			emailAndPassword: options.emailAndPassword,
		}).toEqual({
			providers: ["google"],
			plugins: ["jwt", "oauth-provider", "cimd"],
			emailAndPassword: undefined,
		});
	});
});

describe("sign-up switch", () => {
	let restore = () => {};
	afterEach(() => restore());

	const withSignups = (h: Harness, value: string | undefined): Harness => ({
		...h,
		env: { ...h.env, SIGNUPS_CLOSED: value } as unknown as Env,
	});

	const users = (h: Harness) =>
		h.sqlite.query("select count(*) as n from user").get();

	test("refuses a new Google account while sign-ups are closed", async () => {
		// Given: no user; sign-ups closed
		const h = await makeHarness();
		restore = stubOutside({
			google: {
				sub: "g-new",
				email: "new@example.com",
				name: "New",
				picture: "https://example.com/n.png",
			},
		}).restore;
		// When
		const { res } = await signIn(withSignups(h, "true"));
		// Then
		expect({
			status: res.status,
			location: res.headers.get("location"),
			users: users(h),
		}).toEqual({
			status: 302,
			location: "/?error=signup_disabled",
			users: { n: 0 },
		});
	});

	test("signs in an existing account while sign-ups are closed", async () => {
		// Given: the account made by a sign-in while sign-up was open
		const h = await makeHarness();
		restore = stubOutside({
			google: {
				sub: "g-old",
				email: "old@example.com",
				name: "Old",
				picture: "https://example.com/o.png",
			},
		}).restore;
		expect((await signIn(h)).res.headers.get("location")).toBe("/");
		// When
		const { res, jar } = await signIn(withSignups(h, "true"));
		// Then
		const me = await h.app.request(
			"/api/me",
			{ headers: { cookie: cookie(jar) } },
			h.env,
		);
		expect({
			status: res.status,
			location: res.headers.get("location"),
			me: [me.status, ((await me.json()) as { email: string }).email],
		}).toEqual({
			status: 302,
			location: "/",
			me: [200, "old@example.com"],
		});
	});

	test("refuses a new Google account when sign-ups close after a request with them open", async () => {
		// Given: no user; one request with sign-ups open, then sign-ups closed
		const h = await makeHarness();
		restore = stubOutside({
			google: {
				sub: "g-new",
				email: "new@example.com",
				name: "New",
				picture: "https://example.com/n.png",
			},
		}).restore;
		await h.app.request("/api/auth/get-session", {}, h.env);
		// When
		const { res } = await signIn(withSignups(h, "true"));
		// Then
		expect({
			status: res.status,
			location: res.headers.get("location"),
			users: users(h),
		}).toEqual({
			status: 302,
			location: "/?error=signup_disabled",
			users: { n: 0 },
		});
	});

	test("keeps sign-up open unless SIGNUPS_CLOSED is true", async () => {
		// Given: for each value, a harness with no user
		const results = [];
		for (const value of [undefined, "false", "yes", "TRUE"]) {
			const h = await makeHarness();
			restore = stubOutside({
				google: {
					sub: "g-new",
					email: "new@example.com",
					name: "New",
					picture: "https://example.com/n.png",
				},
			}).restore;
			// When
			const { res } = await signIn(withSignups(h, value));
			restore();
			results.push({
				value: value ?? "not set",
				status: res.status,
				location: res.headers.get("location"),
				users: users(h),
			});
		}
		// Then
		expect(results).toEqual(
			["not set", "false", "yes", "TRUE"].map((value) => ({
				value,
				status: 302,
				location: "/",
				users: { n: 1 },
			})),
		);
	});
});

describe("session cookie cache", () => {
	test("reads a cached session without the database", async () => {
		// Given: alice signed in, with only her session token cookie
		const { app, env, helpers, sqlite } = await withUser(
			"alice-id",
			"alice@example.com",
			"Alice",
		);
		const headers = await helpers.getAuthHeaders({ userId: "alice-id" });
		// When
		const first = await app.request("/api/me", { headers }, env);
		sqlite.run("delete from session");
		const cache = first.headers
			.getSetCookie()
			.map((c) => c.split(";")[0])
			.find((c) => c.startsWith("better-auth.session_data="));
		const second = await app.request(
			"/api/me",
			{ headers: { cookie: `${headers.get("cookie")}; ${cache}` } },
			env,
		);
		// Then
		expect({
			first: first.status,
			setsCache: cache !== undefined,
			second: second.status,
			id: ((await second.json()) as { id?: string }).id,
		}).toEqual({ first: 200, setsCache: true, second: 200, id: "alice-id" });
	});
});

describe("Better Auth per isolate", () => {
	test("builds Better Auth once for two requests with the same env", async () => {
		// Given: an app that counts each database it hands out
		const h = await makeHarness();
		let builds = 0;
		const app = createApp(() => {
			builds += 1;
			return h.settings.db;
		});
		// When
		await app.request("/api/auth/get-session", {}, h.env);
		await app.request("/api/auth/get-session", {}, h.env);
		// Then
		expect({ builds }).toEqual({ builds: 1 });
	});

	test("builds Better Auth again after a start that failed", async () => {
		// Given: a build whose first start fails
		let builds = 0;
		const build = () => {
			builds += 1;
			return (builds === 1
				? { $context: Promise.reject(new Error("start failed")) }
				: { $context: Promise.resolve({}) }) as unknown as Auth;
		};
		const authFor = createAuthCache();
		const settings = {
			secret: "test-secret-at-least-32-characters-long",
			baseURL: "http://localhost:5173",
			google: { clientId: "test-client", clientSecret: "test-secret" },
			signupsClosed: false,
		};
		// When
		const first = await authFor(settings, build).then(
			() => "kept",
			(error: Error) => error.message,
		);
		const second = await authFor(settings, build);
		const third = await authFor(settings, build);
		// Then
		expect({ first, builds, same: second === third }).toEqual({
			first: "start failed",
			builds: 2,
			same: true,
		});
	});
});
