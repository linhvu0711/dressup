import { describe, expect, test } from "bun:test";
import type { BetterAuthOptions } from "better-auth";
import { getTableName, is } from "drizzle-orm";
import { getTableConfig, SQLiteTable } from "drizzle-orm/sqlite-core";
import { createApp } from "./app";
import { type Auth, authOptions, createAuthCache } from "./auth";
import { schema } from "./db";
import {
	BOB,
	cookie,
	finishGoogleSignIn,
	googleUser,
	type Harness,
	makeHarness,
	startGoogleSignIn,
	stubOutside,
	withAccount,
} from "./test/harness";

describe("GET /api/me", () => {
	test("returns the signed-in user on GET /api/me", async () => {
		// Given: alice, signed in
		const { h, headers } = await withAccount();
		const { app, env } = h;
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
		const { app, env } = (await withAccount()).h;
		// When
		const res = await app.request("/api/me", {}, env);
		// Then
		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({ error: "unauthorized" });
	});

	test("gives each session only its own user", async () => {
		// Given: alice and bob, each signed in
		const { h, headers: aliceHeaders } = await withAccount();
		const { app, env } = h;
		const bobHeaders = await h.addAccount(BOB);
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
	test("makes every schema table, and only those, from the migrations", async () => {
		// Given: the database the migrations make, and the Drizzle schema
		const h = await makeHarness();
		// When
		// SQLite makes sqlite_sequence itself for an AUTOINCREMENT key.
		const made = h.tables().filter((name) => !name.startsWith("sqlite_"));
		const schemaTables: string[] = Object.values(schema)
			.filter((value) => is(value, SQLiteTable))
			.map((table) => getTableName(table))
			.sort();
		// Then
		expect({
			notInMigrations: schemaTables.filter((name) => !made.includes(name)),
			notInSchema: made.filter((name) => !schemaTables.includes(name)),
		}).toEqual({ notInMigrations: [], notInSchema: [] });
	});

	// Two branches can each pass on their own and still lose a column once
	// merged: SQLite changes some columns by copying the table, and the copy one
	// branch made does not know the column the other branch added.
	test("makes every schema column, and only those, from the migrations", async () => {
		// Given: the database the migrations make, and the Drizzle schema
		const h = await makeHarness();
		// When
		const differences = Object.values(schema)
			.filter((value) => is(value, SQLiteTable))
			.map((table) => {
				const name = getTableName(table);
				const made = h.columns(name);
				const inSchema = getTableConfig(table).columns.map((c) => c.name);
				return {
					table: name,
					notInMigrations: inSchema.filter((c) => !made.includes(c)),
					notInSchema: made.filter((c) => !inSchema.includes(c)),
				};
			})
			.filter((t) => t.notInMigrations.length + t.notInSchema.length > 0);
		// Then
		expect(differences).toEqual([]);
	});
});

const signIn = async (h: Harness) =>
	finishGoogleSignIn(h, await startGoogleSignIn(h));

describe("Google sign-in", () => {
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
		stubOutside({ google: googleUser("carol") });
		// When
		const { res: first, jar } = await signIn(h);
		const me = await h.app.request(
			"/api/me",
			{ headers: { cookie: cookie(jar) } },
			h.env,
		);
		const { res: second, jar: secondJar } = await signIn(h);
		// Then
		const ids = await h.rows(schema.user);
		const accounts = (await h.rows(schema.account)).map(
			({ providerId, accountId }) => ({
				provider_id: providerId,
				account_id: accountId,
			}),
		);
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
			accounts: [{ provider_id: "google", account_id: "g-carol" }],
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
	const withSignups = (h: Harness, value: string | undefined): Harness => ({
		...h,
		env: { ...h.env, SIGNUPS_CLOSED: value } as unknown as Env,
	});

	const users = async (h: Harness) => (await h.rows(schema.user)).length;

	test("refuses a new Google account while sign-ups are closed", async () => {
		// Given: no user; sign-ups closed
		const h = await makeHarness();
		stubOutside({ google: googleUser("new") });
		// When
		const { res } = await signIn(withSignups(h, "true"));
		// Then
		expect({
			status: res.status,
			location: res.headers.get("location"),
			users: await users(h),
		}).toEqual({
			status: 302,
			location: "/?error=signup_disabled",
			users: 0,
		});
	});

	test("signs in an existing account while sign-ups are closed", async () => {
		// Given: the account made by a sign-in while sign-up was open
		const h = await makeHarness();
		stubOutside({ google: googleUser("old") });
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
		stubOutside({ google: googleUser("new") });
		await h.app.request("/api/auth/get-session", {}, h.env);
		// When
		const { res } = await signIn(withSignups(h, "true"));
		// Then
		expect({
			status: res.status,
			location: res.headers.get("location"),
			users: await users(h),
		}).toEqual({
			status: 302,
			location: "/?error=signup_disabled",
			users: 0,
		});
	});

	test("keeps sign-up open unless SIGNUPS_CLOSED is true", async () => {
		// Given: for each value, a harness with no user
		const results = [];
		for (const value of [undefined, "false", "yes", "TRUE"]) {
			const h = await makeHarness();
			stubOutside({ google: googleUser("new") });
			// When
			const { res } = await signIn(withSignups(h, value));
			results.push({
				value: value ?? "not set",
				status: res.status,
				location: res.headers.get("location"),
				users: await users(h),
			});
		}
		// Then
		expect(results).toEqual(
			["not set", "false", "yes", "TRUE"].map((value) => ({
				value,
				status: 302,
				location: "/",
				users: 1,
			})),
		);
	});
});

describe("session cookie cache", () => {
	test("reads a cached session without the database", async () => {
		// Given: alice signed in, with only her session token cookie
		const { h, headers } = await withAccount();
		const { app, env } = h;
		// When
		const first = await app.request("/api/me", { headers }, env);
		await h.db.delete(schema.session);
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
			return h.db;
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

describe("GET /api/auth/get-session", () => {
	test("sends the session with no set-auth-jwt header", async () => {
		// Given: alice, signed in
		const { h, headers } = await withAccount();
		const { app, env } = h;
		// When
		const res = await app.request("/api/auth/get-session", { headers }, env);
		// Then
		expect({
			status: res.status,
			jwt: res.headers.get("set-auth-jwt"),
		}).toEqual({ status: 200, jwt: null });
	});
});
