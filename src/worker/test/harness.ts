import { Database } from "bun:sqlite";
import { betterAuth } from "better-auth";
import { testUtils } from "better-auth/plugins";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { createApp } from "../app";
import { type AuthSettings, authOptions, createClientDiscovery } from "../auth";
import { type Db, schema } from "../db";

export const testEnv = {
	GOOGLE_CLIENT_ID: "test-client",
	GOOGLE_CLIENT_SECRET: "test-secret",
	BETTER_AUTH_SECRET: "test-secret-at-least-32-characters-long",
	BETTER_AUTH_URL: "http://localhost:5173",
};

// A fresh in-memory database per test: test helpers write real rows, and
// rows from one test would change the counts another test reads.
export async function makeHarness() {
	const sqlite = new Database(":memory:");
	// bun:sqlite leaves foreign keys off; D1 has them on, and the dress rows
	// go with their user only through them.
	sqlite.run("PRAGMA foreign_keys = ON");
	// drizzle's bun:sqlite driver has no batch; D1 runs a batch as one
	// transaction, one batch at a time, so this does the same.
	const local = drizzle({ client: sqlite, schema });
	migrate(local, { migrationsFolder: "./migrations" });
	let last: Promise<unknown> = Promise.resolve();
	const runBatch = async (queries: readonly unknown[]) => {
		sqlite.run("BEGIN");
		try {
			const results = [];
			for (const query of queries) results.push(await query);
			sqlite.run("COMMIT");
			return results;
		} catch (error) {
			sqlite.run("ROLLBACK");
			throw error;
		}
	};
	const db: Db = Object.assign(local, {
		batch: (queries: readonly unknown[]) => {
			const run = last.then(() => runBatch(queries));
			last = run.catch(() => {});
			return run;
		},
	}) as unknown as Db;
	const settings: AuthSettings = {
		db,
		secret: testEnv.BETTER_AUTH_SECRET,
		baseURL: testEnv.BETTER_AUTH_URL,
		google: {
			clientId: testEnv.GOOGLE_CLIENT_ID,
			clientSecret: testEnv.GOOGLE_CLIENT_SECRET,
		},
		signupsClosed: false,
		clientDiscovery: createClientDiscovery(),
	};
	const app = createApp(() => db);
	const helpers = (
		await betterAuth({ ...authOptions(settings), plugins: [testUtils()] })
			.$context
	).test;
	// The app never reads DB here: createApp gets the database from getDb.
	const env = testEnv as unknown as Env;
	return { app, env, helpers, settings, sqlite };
}

const base64url = (value: unknown) =>
	Buffer.from(JSON.stringify(value)).toString("base64url");

type Harness = Awaited<ReturnType<typeof makeHarness>>;

type Outside = {
	google: { sub: string; email: string; name: string; picture: string };
	documents?: Record<string, () => Response>;
};

// Two outside borders: Google's token endpoint, and the websites that host AI
// apps' client metadata documents. Any other outside host throws, so no test
// reaches the internet. Better Auth decodes the id_token without checking its
// signature, so a fake signature is enough.
export function stubOutside({ google, documents = {} }: Outside) {
	const now = Math.floor(Date.now() / 1000);
	const idToken = [
		base64url({ alg: "RS256", typ: "JWT" }),
		base64url({
			iss: "https://accounts.google.com",
			aud: testEnv.GOOGLE_CLIENT_ID,
			sub: google.sub,
			email: google.email,
			email_verified: true,
			name: google.name,
			picture: google.picture,
			iat: now,
			exp: now + 3600,
		}),
		"sig",
	].join(".");
	const calls: { url: string; init?: RequestInit }[] = [];
	const realFetch = globalThis.fetch;
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = input instanceof Request ? input.url : String(input);
		calls.push({ url, init });
		// workerd refuses this value, so production would throw here too.
		if (init?.redirect === "error")
			throw new TypeError(
				'Invalid redirect value, must be one of "follow" or "manual"',
			);
		if (url.startsWith("https://oauth2.googleapis.com/token"))
			return Response.json({
				access_token: "at",
				id_token: idToken,
				expires_in: 3600,
				token_type: "Bearer",
			});
		const document = documents[url];
		if (document) return document();
		if (new URL(url).hostname === "localhost") return realFetch(input, init);
		throw new Error(`unexpected fetch ${url}`);
	}) as typeof fetch;
	return {
		restore: () => {
			globalThis.fetch = realFetch;
		},
		calls,
	};
}

// The browser's cookies: each Set-Cookie line writes its name, and an empty
// value or Max-Age=0 takes it out.
export type Jar = Map<string, string>;

export function store(jar: Jar, res: Response): Jar {
	const next = new Map(jar);
	for (const line of res.headers.getSetCookie()) {
		const [pair] = line.split(";");
		const at = pair.indexOf("=");
		const name = pair.slice(0, at);
		const value = pair.slice(at + 1);
		if (!value || /max-age=0/i.test(line)) next.delete(name);
		else next.set(name, value);
	}
	return next;
}

export const cookie = (jar: Jar) =>
	[...jar].map(([name, value]) => `${name}=${value}`).join("; ");

export async function startGoogleSignIn(
	h: Harness,
	{ oauthQuery }: { oauthQuery?: string } = {},
) {
	const res = await h.app.request(
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
				...(oauthQuery === undefined ? {} : { oauth_query: oauthQuery }),
			}),
		},
		h.env,
	);
	const { url } = (await res.json()) as { url: string };
	const google = new URL(url);
	return {
		res,
		google,
		state: google.searchParams.get("state") ?? "",
		jar: store(new Map(), res),
	};
}

type Start = Awaited<ReturnType<typeof startGoogleSignIn>>;

export async function finishGoogleSignIn(
	h: Harness,
	start: Start,
	{ navigate = false }: { navigate?: boolean } = {},
) {
	const res = await h.app.request(
		`/api/auth/callback/google?code=abc&state=${start.state}`,
		{
			headers: {
				cookie: cookie(start.jar),
				// Better Auth sends a browser that navigates on to the Allow page;
				// any other caller gets JSON or "/".
				...(navigate
					? { "sec-fetch-mode": "navigate", accept: "text/html" }
					: {}),
			},
			redirect: "manual",
		},
		h.env,
	);
	return { res, jar: store(new Map(), res) };
}

export const TEST_APP_ID = "https://client.example/meta.json";

export const testAppDocument = () =>
	Response.json({
		client_id: TEST_APP_ID,
		client_name: "Test App",
		logo_uri: "https://client.example/logo.png",
		redirect_uris: ["http://127.0.0.1/callback"],
		token_endpoint_auth_method: "none",
		grant_types: ["authorization_code", "refresh_token"],
		response_types: ["code"],
	});

// The PKCE pair is RFC 7636's example. The port is one the document does not
// list: a loopback address may use any port.
export const AUTHORIZE =
	"/api/auth/oauth2/authorize?response_type=code&client_id=https%3A%2F%2Fclient.example%2Fmeta.json&redirect_uri=http%3A%2F%2F127.0.0.1%3A33418%2Fcallback&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256&state=xyz&scope=openid+offline_access&resource=http%3A%2F%2Flocalhost%3A5173%2Fapi%2Fmcp";
const CODE_VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";

// An AI app's whole connect: authorize, Google sign-in, the Allow page's
// answer, and on Allow the token. Needs stubOutside with the test app.
export async function connectAiApp(
	h: Harness,
	{ accept }: { accept: boolean },
) {
	const authorize = await h.app.request(
		AUTHORIZE,
		{ redirect: "manual" },
		h.env,
	);
	const allowUrl = new URL(
		authorize.headers.get("location") ?? "",
		testEnv.BETTER_AUTH_URL,
	);
	const oauthQuery = allowUrl.search.slice(1);
	const start = await startGoogleSignIn(h, { oauthQuery });
	const { jar } = await finishGoogleSignIn(h, start, { navigate: true });
	const consentRes = await h.app.request(
		"/api/auth/oauth2/consent",
		{
			method: "POST",
			headers: {
				"content-type": "application/json",
				origin: "http://localhost:5173",
				cookie: cookie(jar),
			},
			body: JSON.stringify({ accept, oauth_query: oauthQuery }),
		},
		h.env,
	);
	const consent = (await consentRes.json()) as { url: string };
	if (!accept) return { jar, allowUrl, consent };
	const code = new URL(consent.url).searchParams.get("code") ?? "";
	const tokenRes = await h.app.request(
		"/api/auth/oauth2/token",
		{
			method: "POST",
			headers: { "content-type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				grant_type: "authorization_code",
				code,
				code_verifier: CODE_VERIFIER,
				client_id: TEST_APP_ID,
				redirect_uri: "http://127.0.0.1:33418/callback",
				resource: "http://localhost:5173/api/mcp",
			}),
		},
		h.env,
	);
	const token = {
		status: tokenRes.status,
		body: (await tokenRes.json()) as {
			access_token: string;
			token_type: string;
			expires_in: number;
		},
	};
	return { jar, allowUrl, consent, token };
}
