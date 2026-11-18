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
