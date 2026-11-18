import { betterAuth } from "better-auth";
import { testUtils } from "better-auth/plugins";
import { drizzle } from "drizzle-orm/d1";
import { getPlatformProxy } from "wrangler";
import { authOptions, createClientDiscovery } from "../src/worker/auth";
import { schema } from "../src/worker/db";

export const E2E_USER = {
	id: "e2e-user",
	email: "e2e@dressup.test",
	name: "E2E Person",
};

// Holds 300 looks, the look limit, for the save form's limit tests.
export const LIMIT_USER = {
	id: "e2e-limit",
	email: "limit@dressup.test",
	name: "Limit Person",
};

// Holds 100 colours, the colour limit, for the colour form's limit test.
export const COLOURS_FULL_USER = {
	id: "e2e-colours-full",
	email: "colours-full@dressup.test",
	name: "Colours Full Person",
};

// Holds 300 combinations, the limit, for the save form's limit test.
export const COMBINATIONS_FULL_USER = {
	id: "e2e-combinations-full",
	email: "combinations-full@dressup.test",
	name: "Combinations Full Person",
};

// Holds 500 owned items, the limit, for the add form's limit test.
export const CLOSET_FULL_USER = {
	id: "e2e-closet-full",
	email: "closet-full@dressup.test",
	name: "Closet Full Person",
};

// Holds 200 wishes, the limit, for the add form's limit test; its newest
// wish holds 10 shop links, the limit, for the shop link limit test.
export const WISHLIST_FULL_USER = {
	id: "e2e-wishlist-full",
	email: "wishlist-full@dressup.test",
	name: "Wishlist Full Person",
};

// Has no colours: the starter set was deleted, for the empty list's test.
export const COLOURS_EMPTY_USER = {
	id: "e2e-colours-empty",
	email: "colours-empty@dressup.test",
	name: "Colours Empty Person",
};

// Holds 100 brands, the brand limit, for the brand form's limit test.
export const BRANDS_FULL_USER = {
	id: "e2e-brands-full",
	email: "brands-full@dressup.test",
	name: "Brands Full Person",
};

type ProxyEnv = {
	DB: Parameters<typeof drizzle>[0];
	BETTER_AUTH_SECRET?: string;
};

function testAuth(
	db: ReturnType<typeof drizzle<typeof schema>>,
	secret?: string,
) {
	return betterAuth({
		...authOptions({
			db,
			secret,
			baseURL: "http://localhost:5173",
			google: { clientId: "", clientSecret: "" },
			signupsClosed: false,
			clientDiscovery: createClientDiscovery(),
		}),
		plugins: [testUtils()],
	});
}

export type TestTools = {
	db: ReturnType<typeof drizzle<typeof schema>>;
	helpers: Awaited<ReturnType<typeof testAuth>["$context"]>["test"];
	newSessionCookies: () => Promise<
		Awaited<
			ReturnType<
				Awaited<ReturnType<typeof testAuth>["$context"]>["test"]["getCookies"]
			>
		>
	>;
};

// Opens the same local D1 and .dev.vars the dev server reads. Only the global
// setup calls this: two processes writing the local D1 at once get SQLITE_BUSY.
export async function withTestAuth<T>(fn: (tools: TestTools) => Promise<T>) {
	const proxy = await getPlatformProxy<ProxyEnv>({
		configPath: "./wrangler.jsonc",
		remoteBindings: false,
	});
	try {
		const db = drizzle(proxy.env.DB, { schema });
		const helpers = (await testAuth(db, proxy.env.BETTER_AUTH_SECRET).$context)
			.test;
		const newSessionCookies = () =>
			helpers.getCookies({ userId: E2E_USER.id, domain: "localhost" });
		return await fn({ db, helpers, newSessionCookies });
	} finally {
		await proxy.dispose();
	}
}
