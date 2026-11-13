import { type BetterAuthOptions, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { type Db, schema } from "./db";

export type AuthSettings = {
	db: Db;
	secret: string | undefined;
	baseURL: string | undefined;
	google: { clientId: string; clientSecret: string };
};

export function authOptions(s: AuthSettings) {
	return {
		database: drizzleAdapter(s.db, { provider: "sqlite", schema }),
		secret: s.secret,
		baseURL: s.baseURL,
	} satisfies BetterAuthOptions;
}

export function createAuth(s: AuthSettings) {
	return betterAuth(authOptions(s));
}
