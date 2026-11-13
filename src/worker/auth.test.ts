import { afterEach, describe, expect, test } from "bun:test";
import type { BetterAuthOptions } from "better-auth";
import { authOptions } from "./auth";
import { makeHarness, stubGoogle } from "./test/harness";

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
	test("makes the auth and dress tables from the migrations", async () => {
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
			"colour_square",
			"outfit",
			"outfit_garment",
			"session",
			"user",
			"verification",
		]);
	});
});

type Harness = Awaited<ReturnType<typeof makeHarness>>;

const cookieHeader = (res: Response) =>
	res.headers
		.getSetCookie()
		.map((c) => c.split(";")[0])
		.join("; ");

async function startGoogleSignIn({ app, env }: Harness) {
	const res = await app.request(
		"/api/auth/sign-in/social",
		{
			method: "POST",
			headers: {
				"content-type": "application/json",
				origin: "http://localhost:5173",
			},
			body: JSON.stringify({
				provider: "google",
				callbackURL: "/",
				errorCallbackURL: "/",
			}),
		},
		env,
	);
	const { url } = (await res.json()) as { url: string };
	const google = new URL(url);
	return {
		res,
		google,
		state: google.searchParams.get("state") ?? "",
		cookie: cookieHeader(res),
	};
}

async function finishGoogleSignIn(h: Harness) {
	const start = await startGoogleSignIn(h);
	return h.app.request(
		`/api/auth/callback/google?code=abc&state=${start.state}`,
		{ headers: { cookie: start.cookie }, redirect: "manual" },
		h.env,
	);
}

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
		const { state, cookie } = await startGoogleSignIn(h);
		// When
		const res = await h.app.request(
			`/api/auth/callback/google?error=access_denied&state=${state}`,
			{ headers: { cookie }, redirect: "manual" },
			h.env,
		);
		// Then
		expect(res.status).toBe(302);
		expect(res.headers.get("location")).toBe("/?error=access_denied");
	});

	test("makes one user on the first Google sign-in and reuses it", async () => {
		// Given
		const h = await makeHarness();
		restore = stubGoogle(
			"g-123",
			"carol@example.com",
			"Carol",
			"https://example.com/c.png",
		);
		// When
		const first = await finishGoogleSignIn(h);
		const me = await h.app.request(
			"/api/me",
			{ headers: { cookie: cookieHeader(first) } },
			h.env,
		);
		const second = await finishGoogleSignIn(h);
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
			sessionCookie: cookieHeader(second).includes(
				"better-auth.session_token=",
			),
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

	test("turns on Google sign-in only", async () => {
		// Given
		const { settings } = await makeHarness();
		// When
		const options: BetterAuthOptions = authOptions(settings);
		// Then
		expect({
			providers: Object.keys(options.socialProviders ?? {}),
			plugins: options.plugins,
			emailAndPassword: options.emailAndPassword,
		}).toEqual({
			providers: ["google"],
			plugins: undefined,
			emailAndPassword: undefined,
		});
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
