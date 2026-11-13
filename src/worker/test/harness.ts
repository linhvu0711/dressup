import { Database } from "bun:sqlite";
import { betterAuth } from "better-auth";
import { testUtils } from "better-auth/plugins";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { createApp } from "../app";
import { type AuthSettings, authOptions } from "../auth";
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

// Google is the one outside border. Only its token endpoint answers; any other
// outside host throws, so no test can reach Google. Better Auth decodes the
// id_token without checking its signature, so a fake signature is enough.
export function stubGoogle(
	sub: string,
	email: string,
	name: string,
	picture: string,
) {
	const now = Math.floor(Date.now() / 1000);
	const idToken = [
		base64url({ alg: "RS256", typ: "JWT" }),
		base64url({
			iss: "https://accounts.google.com",
			aud: testEnv.GOOGLE_CLIENT_ID,
			sub,
			email,
			email_verified: true,
			name,
			picture,
			iat: now,
			exp: now + 3600,
		}),
		"sig",
	].join(".");
	const realFetch = globalThis.fetch;
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = input instanceof Request ? input.url : String(input);
		if (url.startsWith("https://oauth2.googleapis.com/token"))
			return Response.json({
				access_token: "at",
				id_token: idToken,
				expires_in: 3600,
				token_type: "Bearer",
			});
		if (new URL(url).hostname === "localhost") return realFetch(input, init);
		throw new Error(`unexpected fetch ${url}`);
	}) as typeof fetch;
	return () => {
		globalThis.fetch = realFetch;
	};
}
