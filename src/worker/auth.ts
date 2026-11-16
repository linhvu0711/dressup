import { cimd } from "@better-auth/cimd";
import { mcp } from "@better-auth/mcp";
import { type BetterAuthOptions, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { jwt } from "better-auth/plugins";
import { type Db, schema } from "./db";

export type AuthSettings = {
	db: Db;
	secret: string | undefined;
	baseURL: string;
	google: { clientId: string; clientSecret: string };
	signupsClosed: boolean;
	clientDiscovery: ReturnType<typeof cimd>;
};

export function mcpResource(baseURL: string) {
	return `${baseURL}/api/mcp`;
}

export function createClientDiscovery() {
	return cimd({
		// workerd throws on redirect "error" (P3); "manual" hands the 302 back,
		// and the CIMD plugin refuses any answer but 200.
		fetchClientMetadataResource: (input, init) =>
			fetch(input, { ...init, redirect: "manual" }),
	});
}

export function authOptions(s: AuthSettings) {
	return {
		database: drizzleAdapter(s.db, { provider: "sqlite", schema }),
		secret: s.secret,
		baseURL: s.baseURL,
		session: { cookieCache: { enabled: true, maxAge: 300 } },
		socialProviders: {
			google: {
				clientId: s.google.clientId,
				clientSecret: s.google.clientSecret,
				// A new Google account goes back to /?error=signup_disabled; an
				// account that exists signs in.
				disableSignUp: s.signupsClosed,
			},
		},
		disabledPaths: ["/token"],
		plugins: [
			jwt(),
			mcp({
				resource: mcpResource(s.baseURL),
				loginPage: "/allow",
				consentPage: "/allow",
				scopes: ["openid", "offline_access"],
				allowDynamicClientRegistration: false,
			}),
			s.clientDiscovery,
		],
		// Every OAuth error lands on the sign-in screen with ?error=, never on
		// Better Auth's own error page.
		onAPIError: { errorURL: "/" },
		// Workers send no X-Forwarded-For; without this all rate limits share one key.
		advanced: { ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] } },
	} satisfies BetterAuthOptions;
}

export function createAuth(s: AuthSettings) {
	return betterAuth(authOptions(s));
}

export type Auth = ReturnType<typeof createAuth>;
export type AuthEnvSettings = Omit<AuthSettings, "db" | "clientDiscovery">;

// Building Better Auth on every request cost more CPU than the free plan's
// 10 ms (#48). An instance is kept only after its start resolved: a start
// left pending by a request Cloudflare stopped never settles on Workers.
export function createAuthCache() {
	let kept: { key: string; auth: Auth } | undefined;
	return async (settings: AuthEnvSettings, build: () => Auth) => {
		const key = JSON.stringify(settings);
		if (kept?.key === key) return kept.auth;
		const auth = build();
		await auth.$context;
		kept = { key, auth };
		return auth;
	};
}
