import { afterEach, describe, expect, test } from "bun:test";
import {
	AUTHORIZE,
	connectAiApp,
	cookie,
	finishGoogleSignIn,
	makeHarness,
	startGoogleSignIn,
	stubOutside,
	TEST_APP_ID,
	testAppDocument,
} from "./test/harness";

type Harness = Awaited<ReturnType<typeof makeHarness>>;

const ALICE = {
	sub: "g-alice",
	email: "alice@example.com",
	name: "Alice",
	picture: "https://example.com/a.png",
};

const authorize = (h: Harness, path = AUTHORIZE) =>
	h.app.request(path, { redirect: "manual" }, h.env);

const withClient = (clientId: string) =>
	AUTHORIZE.replace(
		"client_id=https%3A%2F%2Fclient.example%2Fmeta.json",
		`client_id=${encodeURIComponent(clientId)}`,
	);

const count = (h: Harness, table: string) =>
	(h.sqlite.query(`select count(*) as n from ${table}`).get() as { n: number })
		.n;

const payload = (jwt: string) =>
	JSON.parse(Buffer.from(jwt.split(".")[1] ?? "", "base64url").toString()) as {
		sub: string;
		azp: string;
	};

describe("AI app sign-in", () => {
	let outside: ReturnType<typeof stubOutside> | undefined;
	afterEach(() => outside?.restore());

	const given = async (documents: Record<string, () => Response> = {}) => {
		const h = await makeHarness();
		outside = stubOutside({
			google: ALICE,
			documents: { [TEST_APP_ID]: testAppDocument, ...documents },
		});
		return h;
	};

	test("sends an AI app with a client metadata document to the Allow page", async () => {
		// Given: no session
		const h = await given();
		// When
		const res = await authorize(h);
		// Then
		const location = new URL(
			res.headers.get("location") ?? "",
			"http://localhost:5173",
		);
		expect({
			status: res.status,
			path: location.pathname,
			clientId: location.searchParams.get("client_id"),
		}).toEqual({
			status: 302,
			path: "/allow",
			clientId: "https://client.example/meta.json",
		});
	});

	test("sends the Google callback of an Allow sign-in back to the Allow page", async () => {
		// Given: the authorize Location's query, and a sign-in started with it
		const h = await given();
		const location = (await authorize(h)).headers.get("location") ?? "";
		const oauthQuery = new URL(location, "http://localhost:5173").search.slice(
			1,
		);
		const start = await startGoogleSignIn(h, { oauthQuery });
		// When
		const { res } = await finishGoogleSignIn(h, start, { navigate: true });
		// Then
		expect({
			status: res.status,
			path: new URL(res.headers.get("location") ?? "", "http://localhost:5173")
				.pathname,
		}).toEqual({ status: 302, path: "/allow" });
	});

	test("issues a pass for the account after Allow", async () => {
		// Given
		const h = await given();
		// When
		const { jar, token } = await connectAiApp(h, { accept: true });
		// Then
		const me = await h.app.request(
			"/api/me",
			{ headers: { cookie: cookie(jar) } },
			h.env,
		);
		const aliceId = ((await me.json()) as { id: string }).id;
		const claims = payload(token?.body.access_token ?? "");
		expect({
			status: token?.status,
			tokenType: token?.body.token_type,
			expiresIn: token?.body.expires_in,
			sub: claims.sub,
			azp: claims.azp,
		}).toEqual({
			status: 200,
			tokenType: "Bearer",
			expiresIn: 3600,
			sub: aliceId,
			azp: "https://client.example/meta.json",
		});
	});

	test("sends Cancel back to the app with access_denied and stores no allow", async () => {
		// Given
		const h = await given();
		// When
		const { consent } = await connectAiApp(h, { accept: false });
		// Then
		expect({ url: consent.url, allows: count(h, "oauth_consent") }).toEqual({
			url: "http://127.0.0.1:33418/callback?error=access_denied&error_description=User+denied+access&state=xyz&iss=http%3A%2F%2Flocalhost%3A5173%2Fapi%2Fauth",
			allows: 0,
		});
	});

	test("refuses an app with no client metadata document", async () => {
		// Given
		const h = await given();
		// When
		const res = await authorize(h, withClient("abc"));
		// Then
		expect({
			status: res.status,
			location: res.headers.get("location"),
			apps: count(h, "oauth_client"),
		}).toEqual({
			status: 302,
			location: "/?error=invalid_client&error_description=client+not+found",
			apps: 0,
		});
	});

	test("refuses a request to register a client", async () => {
		// Given
		const h = await given();
		// When
		const res = await h.app.request(
			"/api/auth/oauth2/register",
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin: "http://localhost:5173",
				},
				body: JSON.stringify({
					client_name: "Cursor",
					redirect_uris: ["http://127.0.0.1/callback"],
					token_endpoint_auth_method: "none",
					grant_types: ["authorization_code"],
					response_types: ["code"],
				}),
			},
			h.env,
		);
		// Then
		expect({ status: res.status, body: await res.json() }).toEqual({
			status: 403,
			body: {
				error: "access_denied",
				error_description: "Client registration is disabled",
			},
		});
	});

	test("fetches the client metadata document the way Cloudflare Workers allows", async () => {
		// Given: the stub throws on redirect "error", as workerd does
		const h = await given();
		// When
		const res = await authorize(h);
		// Then
		const call = outside?.calls.find((c) => c.url === TEST_APP_ID);
		expect({ status: res.status, redirect: call?.init?.redirect }).toEqual({
			status: 302,
			redirect: "manual",
		});
	});

	test("refuses a client metadata document behind a redirect", async () => {
		// Given
		const h = await given({
			"https://client.example/redirect.json": () =>
				new Response(null, { status: 302, headers: { location: TEST_APP_ID } }),
		});
		// When
		const res = await authorize(
			h,
			withClient("https://client.example/redirect.json"),
		);
		// Then
		expect({ status: res.status, body: await res.json() }).toEqual({
			status: 400,
			body: {
				error: "invalid_client",
				error_description: "Metadata document fetch returned HTTP 302",
			},
		});
	});

	test("refuses a client metadata document over 5 KB", async () => {
		// Given
		const big = "https://client.example/big.json";
		const h = await given({
			[big]: () =>
				Response.json({
					client_id: big,
					client_name: "Test App",
					logo_uri: "https://client.example/logo.png",
					redirect_uris: ["http://127.0.0.1/callback"],
					token_endpoint_auth_method: "none",
					grant_types: ["authorization_code", "refresh_token"],
					response_types: ["code"],
					padding: "x".repeat(6000),
				}),
		});
		// When
		const res = await authorize(h, withClient(big));
		// Then
		expect({ status: res.status, body: await res.json() }).toEqual({
			status: 400,
			body: {
				error: "invalid_client",
				error_description: "Metadata document exceeds 5KB size limit",
			},
		});
	});

	test("reads an app's client metadata document once for its next calls", async () => {
		// Given
		const h = await given();
		// When: two requests
		await authorize(h);
		await authorize(h);
		// Then
		expect({
			documentFetches: outside?.calls.filter((c) => c.url === TEST_APP_ID)
				.length,
		}).toEqual({ documentFetches: 1 });
	});

	test("ends a closed sign-up from the Allow flow on the sign-in screen", async () => {
		// Given: sign-ups closed on every request; Google answers for a new
		// account
		const open = await given();
		const h = {
			...open,
			env: { ...open.env, SIGNUPS_CLOSED: "true" } as unknown as Env,
		};
		const location = (await authorize(h)).headers.get("location") ?? "";
		const oauthQuery = new URL(location, "http://localhost:5173").search.slice(
			1,
		);
		// When
		const start = await startGoogleSignIn(h, { oauthQuery });
		const { res } = await finishGoogleSignIn(h, start, { navigate: true });
		// Then
		expect({
			status: res.status,
			location: res.headers.get("location"),
			users: count(h, "user"),
			allows: count(h, "oauth_consent"),
		}).toEqual({
			status: 302,
			location: "/?error=signup_disabled",
			users: 0,
			allows: 0,
		});
	});
});
