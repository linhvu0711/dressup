import { Database } from "bun:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { betterAuth } from "better-auth";
import { testUtils } from "better-auth/plugins";
import { eq, getTableName, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";
import { createApp } from "../app";
import { type AuthSettings, authOptions, createClientDiscovery } from "../auth";
import { type Db, schema } from "../db";
import { insertInChunks } from "./insert-in-chunks";
import { MemoryBucket } from "./memory-bucket";
import { seedCombinations } from "./seed-combinations";
import { seedOwnedItems } from "./seed-owned-items";
import { seedShopLinks, seedWishes } from "./seed-wishes";

const testEnv = {
	GOOGLE_CLIENT_ID: "test-client",
	GOOGLE_CLIENT_SECRET: "test-secret",
	BETTER_AUTH_SECRET: "test-secret-at-least-32-characters-long",
	BETTER_AUTH_URL: "http://localhost:5173",
};

// A fresh in-memory database per test: test helpers write real rows, and
// rows from one test would change the counts another test reads.
// A migration's statements, split as drizzle-kit writes them.
const migrationStatements = (tag: string) =>
	readFileSync(`migrations/${tag}.sql`, "utf8")
		.split("--> statement-breakpoint")
		.map((statement) => statement.trim())
		.filter((statement) => statement !== "");

// Wrangler applies the migration files in name order and keeps no journal,
// so tests build the database the same way. With `through`, the tags stop
// there, so a test can build the database as it stood before a later one.
function migrationTags(through?: string): string[] {
	const tags = readdirSync("migrations")
		.filter((name) => name.endsWith(".sql"))
		.map((name) => name.slice(0, -".sql".length))
		.sort();
	if (through === undefined) return tags;
	const end = tags.indexOf(through);
	if (end === -1) throw new Error(`No migration ${through}`);
	return tags.slice(0, end + 1);
}

export async function makeHarness(options: { through?: string } = {}) {
	const sqlite = new Database(":memory:");
	// bun:sqlite leaves foreign keys off; D1 has them on, and an account's rows
	// go with its user only through them.
	sqlite.run("PRAGMA foreign_keys = ON");
	// drizzle's bun:sqlite driver has no batch; D1 runs a batch as one
	// transaction, one batch at a time, so this does the same.
	const local = drizzle({ client: sqlite, schema });
	for (const tag of migrationTags(options.through))
		for (const statement of migrationStatements(tag)) sqlite.run(statement);
	let last: Promise<unknown> = Promise.resolve();
	let onBatch = () => {};
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
			onBatch();
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
	const pictures = new MemoryBucket();
	// The app never reads DB here: createApp gets the database from getDb.
	const env = { ...testEnv, PICTURES: pictures } as unknown as Env;
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
		if (userId === undefined) return query;
		if (!table.userId)
			throw new Error(`rows: ${getTableName(table)} has no user column`);
		return query.where(eq(table.userId, userId));
	}
	const tables = () =>
		sqlite
			.query<{ name: string }, []>(
				"select name from sqlite_master where type = 'table' order by name",
			)
			.all()
			.map((row) => row.name);
	// A table's column names in order, to see what a migration dropped.
	const columns = (table: string) =>
		sqlite
			.query<{ name: string }, [string]>(
				"select name from pragma_table_info(?) order by cid",
			)
			.all(table)
			.map((row) => row.name);
	const seedCombinationsOf = (userId: string, n: number) =>
		seedCombinations(db, userId, n);
	const seedOwnedItemsOf = (userId: string, n: number) =>
		seedOwnedItems(db, userId, n);
	const seedWishesOf = (userId: string, n: number) => seedWishes(db, userId, n);
	const seedShopLinksOf = (userId: string, wishId: string, n: number) =>
		seedShopLinks(db, userId, wishId, n);
	// Writes n draft pictures of the account with no objects, and raises the
	// stored bytes by them, so a test can reach a limit without n uploads.
	const seedPictures = async (userId: string, n: number, bytes = 1) => {
		const all = Array.from({ length: n }, () => ({
			id: crypto.randomUUID(),
			userId,
			ownedItemId: null,
			bytes,
			createdAt: new Date(),
		}));
		await insertInChunks(db, schema.picture, all);
		await db
			.insert(schema.pictureStorage)
			.values({ id: 1, bytes: n * bytes })
			.onConflictDoUpdate({
				target: schema.pictureStorage.id,
				set: { bytes: sql`${schema.pictureStorage.bytes} + excluded.bytes` },
			});
	};
	const setUploads = async (month: string, count: number) => {
		await db
			.insert(schema.pictureUploadMonth)
			.values({ month, count })
			.onConflictDoUpdate({
				target: schema.pictureUploadMonth.month,
				set: { count },
			});
	};
	const storedBytes = async () =>
		(await db.select().from(schema.pictureStorage))[0]?.bytes ?? 0;
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
	// Rows of the tables a later migration drops, which the schema no longer
	// holds.
	const insertOld = (sql: string) => {
		if (!/^\s*INSERT INTO\b/.test(sql))
			throw new Error("insertOld takes only INSERT INTO");
		sqlite.run(sql);
	};
	// A race test must let two writes make their reads before either batch
	// runs, as two D1 requests can; the gate holds every batch until release.
	const holdBatches = () => {
		let open = () => {};
		const gate = new Promise<void>((resolve) => {
			open = resolve;
		});
		last = last.then(() => gate);
		let queued = 0;
		let waiters: { n: number; resolve: () => void }[] = [];
		onBatch = () => {
			queued++;
			waiters = waiters.filter((waiter) => {
				if (queued < waiter.n) return true;
				waiter.resolve();
				return false;
			});
		};
		return {
			queued: (n: number) =>
				new Promise<void>((resolve) => {
					if (queued >= n) resolve();
					else waiters.push({ n, resolve });
				}),
			release: () => {
				onBatch = () => {};
				open();
			},
		};
	};
	// Runs a migration again, as a Worker deploy would on a live database.
	const runMigration = (tag: string) => {
		for (const statement of migrationStatements(tag)) sqlite.run(statement);
	};
	return {
		app,
		env,
		settings,
		db,
		pictures,
		addAccount,
		rows,
		tables,
		columns,
		accountRows,
		userForeignKeys,
		seedCombinations: seedCombinationsOf,
		seedOwnedItems: seedOwnedItemsOf,
		seedWishes: seedWishesOf,
		seedShopLinks: seedShopLinksOf,
		seedPictures,
		setUploads,
		storedBytes,
		addTrigger,
		insertOld,
		holdBatches,
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

// A fresh harness with Alice signed in.
export async function withAccount() {
	const h = await makeHarness();
	const headers = await h.addAccount(ALICE);
	return { h, headers };
}

// Another tab's save of the same name, written by a trigger just before this
// request's own write, after its duplicate check has passed.
export const otherTabWrites = (
	h: Harness,
	table: "brand" | "colour" | "tag",
	when: "INSERT" | "UPDATE",
	name: string,
) => {
	const hex = table === "colour" ? ["hex"] : [];
	const columns = ["id", "user_id", "name", ...hex, "created_at"].join(", ");
	const values = [
		"'other-tab'",
		"NEW.user_id",
		"lower(NEW.name)",
		...hex.map((c) => `NEW.${c}`),
		"0",
	].join(", ");
	h.addTrigger(
		`CREATE TRIGGER other_tab BEFORE ${when} ON ${table} WHEN NEW.name = '${name}'
		BEGIN
			INSERT INTO ${table} (${columns})
			VALUES (${values});
		END`,
	);
};

// Every row of a table.
export const count = async (h: Harness, table: SQLiteTable) =>
	(await h.rows(table)).length;

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

// A browser's whole Google sign-in, as the stubbed Google user.
export const googleSignIn = async (h: Harness) =>
	finishGoogleSignIn(h, await startGoogleSignIn(h));

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
	if (!accept) return { jar, consent };
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
	return { jar, consent, token };
}

// A request as a signed-in account (its headers) or as a browser (its
// cookies). Bytes go as an upload; any other body goes as JSON.
// A signed-in account's headers, or a browser's cookies.
type Auth = Headers | Record<string, string> | Jar;

export const send = async (
	h: Harness,
	auth: Auth,
	method: string,
	path: string,
	body?: unknown,
): Promise<Response> => {
	const headers = new Headers(
		auth instanceof Map ? (auth.size ? { cookie: cookie(auth) } : {}) : auth,
	);
	if (body instanceof Uint8Array) headers.set("content-type", "image/jpeg");
	else if (body !== undefined) headers.set("content-type", "application/json");
	return h.app.request(
		path,
		{
			method,
			headers,
			body:
				body === undefined || body instanceof Uint8Array
					? (body as BodyInit | undefined)
					: JSON.stringify(body),
		},
		h.env,
	);
};

export const answer = async (res: Response) => ({
	status: res.status,
	body: await res.json(),
});

// The server checks only the first bytes, so these are not whole pictures.
export const bytes = (head: number[], length: number) => {
	const body = new Uint8Array(length).fill(0x11);
	body.set(head);
	return body;
};

export const JPEG = bytes([0xff, 0xd8, 0xff, 0xe0], 100);
export const PNG = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 100);
export const PDF = bytes([...new TextEncoder().encode("%PDF-1.7")], 100);

// Uploads a draft picture and gives its id.
export const uploadPicture = async (
	h: Harness,
	auth: Auth,
	body: Uint8Array = JPEG,
) =>
	(
		(await (await send(h, auth, "POST", "/api/pictures", body)).json()) as {
			picture: { id: string };
		}
	).picture.id;

// Colour ids by name.
export type Ids = Record<string, string>;

export const colourIds = async (h: Harness, auth: Auth): Promise<Ids> => {
	const { colours } = (await (
		await send(h, auth, "GET", "/api/colours")
	).json()) as { colours: { id: string; name: string }[] };
	return Object.fromEntries(colours.map((c) => [c.name, c.id]));
};

// Alice signed in, with her colour ids.
export async function alice() {
	const { h, headers } = await withAccount();
	const ids = await colourIds(h, headers);
	return { h, headers, ids };
}

// Adds a brand through the route and gives its id.
export const postBrand = async (h: Harness, auth: Auth, name: string) =>
	(
		(await (await send(h, auth, "POST", "/api/brands", { name })).json()) as {
			brand: { id: string };
		}
	).brand.id;

// Adds "Brand 1" to "Brand n" through the route.
export async function postBrands(h: Harness, auth: Auth, n: number) {
	for (let i = 1; i <= n; i++)
		await send(h, auth, "POST", "/api/brands", { name: `Brand ${i}` });
}

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
	content: { type: string; text?: string; data?: string; mimeType?: string }[];
	structuredContent?: Record<string, unknown>;
};

type ListedTool = {
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
	const callTool = async (
		name: string,
		args: Record<string, unknown> = {},
	): Promise<ToolResult> => {
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
		return result;
	};
	const call = async (name: string, args: Record<string, unknown> = {}) => {
		const result = await callTool(name, args);
		return {
			isError: result.isError ?? false,
			text: result.content[0]?.text,
			data: result.structuredContent,
		};
	};
	// A picture comes back as an image part, which has no text.
	const show = async (name: string, args: Record<string, unknown> = {}) => {
		const result = await callTool(name, args);
		return { isError: result.isError ?? false, content: result.content };
	};
	const list = async () => {
		id += 1;
		const { result } = await message<{ result: { tools: ListedTool[] } }>(
			await post(h, { jsonrpc: "2.0", id, method: "tools/list" }, session),
		);
		return result.tools;
	};
	return { jar, call, show, list };
}

const accountId = async (h: Harness, jar: Jar) =>
	((await (await send(h, jar, "GET", "/api/me")).json()) as { id: string }).id;

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
