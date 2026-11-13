import { Database } from "bun:sqlite";
import { betterAuth } from "better-auth";
import { testUtils } from "better-auth/plugins";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { createApp } from "../app";
import { type AuthSettings, authOptions } from "../auth";
import { schema } from "../db";

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
	const db = drizzle({ client: sqlite, schema });
	migrate(db, { migrationsFolder: "./migrations" });
	const settings: AuthSettings = {
		db,
		secret: testEnv.BETTER_AUTH_SECRET,
		baseURL: testEnv.BETTER_AUTH_URL,
		google: {
			clientId: testEnv.GOOGLE_CLIENT_ID,
			clientSecret: testEnv.GOOGLE_CLIENT_SECRET,
		},
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
