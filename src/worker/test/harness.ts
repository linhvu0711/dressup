import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { betterAuth } from "better-auth";
import { testUtils } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";
import { createApp } from "../app";
import { type AuthSettings, authOptions, createClientDiscovery } from "../auth";
import { type Db, schema } from "../db";
import { seedCombinations } from "./seed-combinations";
import { seedOwnedItems } from "./seed-owned-items";

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
	// Saves the account and gives the headers of a session signed in as it.
	const addAccount = async (person: Person) => {
		await helpers.saveUser(helpers.createUser(person));
		return helpers.getAuthHeaders({ userId: person.id });
	};
	// Every row of a table, or the rows of one account; in no set order.
	async function rows<T extends SQLiteTable>(
		table: T,
	): Promise<T["$inferSelect"][]>;
	async function rows<T extends SQLiteTable & { userId: SQLiteColumn }>(
		table: T,
		userId: string,
	): Promise<T["$inferSelect"][]>;
	async function rows(
		table: SQLiteTable & { userId?: SQLiteColumn },
		userId?: string,
	) {
		const query = db.select().from(table);
		if (userId === undefined || !table.userId) return query;
		return query.where(eq(table.userId, userId));
	}
	const tables = () =>
		sqlite
			.query<{ name: string }, []>(
				"select name from sqlite_master where type = 'table' order by name",
			)
			.all()
			.map((row) => row.name);
	// Writes n valid looks for the account in one insert, so a test can reach
	// the look limit without 300 requests.
	const seedLooks = async (userId: string, n: number) => {
		await db.insert(schema.look).values(
			Array.from({ length: n }, (_, i) => ({
				id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
				userId,
				modeId: "polo-sweater-harrington",
				name: "",
				colours: {
					chino_p: "#C9B38C",
					polo_l: "#F3F1EC",
					sweater: "#1F3A5F",
					harrington: "#55633F",
				} as const,
				open: [],
			})),
		);
	};
	const seedCombinationsOf = (userId: string, n: number) =>
		seedCombinations(db, userId, n);
	const seedOwnedItemsOf = (userId: string, n: number) =>
		seedOwnedItems(db, userId, n);
	// Each foreign key to user, read from the database itself, so a table a
	// new migration adds is in the list with no edit.
	const userKeys = () =>
		tables().flatMap((table) =>
			sqlite
				.query<{ table: string; from: string; on_delete: string }, []>(
					`select "table", "from", on_delete from pragma_foreign_key_list('${table}')`,
				)
				.all()
				.filter((key) => key.table === "user")
				.map((key) => ({ table, column: key.from, onDelete: key.on_delete })),
		);
	const countWhere = (table: string, column: string, userId: string) =>
		sqlite
			.query<{ n: number }, [string]>(
				`select count(*) as n from "${table}" where "${column}" = ?`,
			)
			.get(userId)?.n ?? 0;
	// The account's row count in user and in each table that points at it.
	const accountRows = (userId: string) => {
		const counts: Record<string, number> = {
			user: countWhere("user", "id", userId),
		};
		for (const { table, column } of userKeys())
			counts[table] = (counts[table] ?? 0) + countWhere(table, column, userId);
		return counts;
	};
	// The on_delete rule of each foreign key to user, keyed table.column.
	const userForeignKeys = () =>
		Object.fromEntries(
			userKeys().map(({ table, column, onDelete }) => [
				`${table}.${column}`,
				onDelete,
			]),
		);
	// The one door for raw SQL: a trigger that makes a write fail, or races it.
	const addTrigger = (sql: string) => {
		if (!/^\s*CREATE TRIGGER\b/.test(sql))
			throw new Error("addTrigger takes only CREATE TRIGGER");
		sqlite.run(sql);
	};
	// Runs a migration again, as a Worker deploy would on a live database.
	const runMigration = (tag: string) => {
		const statements = readFileSync(`migrations/${tag}.sql`, "utf8")
			.split("--> statement-breakpoint")
			.map((statement) => statement.trim())
			.filter((statement) => statement !== "");
		for (const statement of statements) sqlite.run(statement);
	};
	return {
		app,
		env,
		helpers,
		settings,
		db,
		addAccount,
		rows,
		tables,
		accountRows,
		userForeignKeys,
		seedLooks,
		seedCombinations: seedCombinationsOf,
		seedOwnedItems: seedOwnedItemsOf,
		addTrigger,
		runMigration,
	};
}

export type Harness = Awaited<ReturnType<typeof makeHarness>>;

type Person = { id: string; email: string; name: string };

export const ALICE: Person = {
	id: "alice-id",
	email: "alice@example.com",
	name: "Alice",
};

export const BOB: Person = {
	id: "bob-id",
	email: "bob@example.com",
	name: "Bob",
};

// A fresh harness with one signed-in account, Alice unless named.
export async function withAccount(person: Person = ALICE) {
	const h = await makeHarness();
	const headers = await h.addAccount(person);
	return { h, headers };
}

const base64url = (value: unknown) =>
	Buffer.from(JSON.stringify(value)).toString("base64url");

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

type GoogleUser = { sub: string; email: string; name: string; picture: string };

// A Google profile from one lower-case name: googleUser("bob") is Bob,
// bob@example.com, sub g-bob.
export const googleUser = (name: string): GoogleUser => ({
	sub: `g-${name}`,
	email: `${name}@example.com`,
	name: name.charAt(0).toUpperCase() + name.slice(1),
	picture: `https://example.com/${name.charAt(0)}.png`,
});

type Outside = {
	google?: GoogleUser;
	documents?: Record<string, () => Response | Promise<Response>>;
};

// Kept before any stub: src/worker/test/setup.ts puts it back after each test.
const realFetch = globalThis.fetch;

// Two outside borders: Google's token endpoint, and the websites that host AI
// apps' client metadata documents. Any other outside host throws, so no test
// reaches the internet. Better Auth decodes the id_token without checking its
// signature, so a fake signature is enough. With no arguments it is Alice and
// the test app.
export function stubOutside({
	google = googleUser("alice"),
	documents = {},
}: Outside = {}) {
	const answers: Outside["documents"] = {
		[TEST_APP_ID]: testAppDocument,
		...documents,
	};
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
		const document = answers[url];
		if (document) return document();
		if (new URL(url).hostname === "localhost") return realFetch(input, init);
		throw new Error(`unexpected fetch ${url}`);
	}) as typeof fetch;
	return { calls };
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

export const send = (
	h: Harness,
	jar: Jar,
	path: string,
	init: RequestInit = {},
) =>
	h.app.request(
		path,
		{
			...init,
			headers: {
				...(init.headers as Record<string, string>),
				...(jar.size ? { cookie: cookie(jar) } : {}),
			},
		},
		h.env,
	);

export const INITIALIZE = {
	jsonrpc: "2.0",
	id: 1,
	method: "initialize",
	params: {
		protocolVersion: "2025-11-25",
		capabilities: {},
		clientInfo: { name: "test", version: "1" },
	},
};

export const post = (
	h: Harness,
	body: unknown,
	headers: Record<string, string> = {},
) =>
	h.app.request(
		"/api/mcp",
		{
			method: "POST",
			headers: {
				"content-type": "application/json",
				accept: "application/json, text/event-stream",
				...headers,
			},
			body: JSON.stringify(body),
		},
		h.env,
	);

// The answer comes as one server-sent event; its data line is the JSON-RPC
// message.
export async function message<T>(res: Response): Promise<T> {
	const text = await res.text();
	const data = text.split("\n").find((line) => line.startsWith("data: "));
	return JSON.parse(data?.slice("data: ".length) ?? text) as T;
}

type ToolResult = {
	isError?: boolean;
	content: { type: string; text: string }[];
	structuredContent?: Record<string, unknown>;
};

export type ListedTool = {
	name: string;
	title?: string;
	annotations?: Record<string, unknown>;
};

// A connected AI app after its handshake. Needs stubOutside with the test
// app.
export async function aiSession(h: Harness) {
	const { jar, token } = await connectAiApp(h, { accept: true });
	const session = {
		authorization: `Bearer ${token?.body.access_token}`,
		"mcp-protocol-version": "2025-11-25",
	};
	await post(h, INITIALIZE, session);
	await post(
		h,
		{ jsonrpc: "2.0", method: "notifications/initialized" },
		session,
	);
	let id = 1;
	const call = async (name: string, args: Record<string, unknown> = {}) => {
		id += 1;
		const { result, error } = await message<{
			result?: ToolResult;
			error?: unknown;
		}>(
			await post(
				h,
				{
					jsonrpc: "2.0",
					id,
					method: "tools/call",
					params: { name, arguments: args },
				},
				session,
			),
		);
		if (!result)
			throw new Error(`tools/call ${name}: ${JSON.stringify(error)}`);
		return {
			isError: result.isError ?? false,
			text: result.content[0]?.text,
			data: result.structuredContent,
		};
	};
	const list = async () => {
		id += 1;
		const { result } = await message<{ result: { tools: ListedTool[] } }>(
			await post(h, { jsonrpc: "2.0", id, method: "tools/list" }, session),
		);
		return result.tools;
	};
	return { jar, call, list };
}

const accountId = async (h: Harness, jar: Jar) =>
	((await (await send(h, jar, "/api/me")).json()) as { id: string }).id;

// Alice, through Google, with the test app connected and allowed: its pass in
// bearer, her browser in jar.
export async function withAiApp() {
	const h = await makeHarness();
	stubOutside();
	const { jar, token } = await connectAiApp(h, { accept: true });
	const bearer = { authorization: `Bearer ${token?.body.access_token}` };
	return { h, jar, bearer, userId: await accountId(h, jar) };
}

// Alice's connected test app after its MCP handshake.
export async function withAiSession() {
	const h = await makeHarness();
	stubOutside();
	const ai = await aiSession(h);
	return { h, ai, userId: await accountId(h, ai.jar) };
}
