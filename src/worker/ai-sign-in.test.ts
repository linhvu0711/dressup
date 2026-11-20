import { afterEach, describe, expect, setSystemTime, test } from "bun:test";
import { schema } from "./db";
import {
	AUTHORIZE,
	connectAiApp,
	cookie,
	count,
	finishGoogleSignIn,
	type Harness,
	makeHarness,
	send,
	startGoogleSignIn,
	stubOutside,
	TEST_APP_ID,
	testAppDocument,
} from "./test/harness";

const authorize = (h: Harness, path = AUTHORIZE) =>
	h.app.request(path, { redirect: "manual" }, h.env);

const withClient = (clientId: string) =>
	AUTHORIZE.replace(
		"client_id=https%3A%2F%2Fclient.example%2Fmeta.json",
		`client_id=${encodeURIComponent(clientId)}`,
	);

const payload = (jwt: string) =>
	JSON.parse(Buffer.from(jwt.split(".")[1] ?? "", "base64url").toString()) as {
		sub: string;
		azp: string;
	};

// The first answers come from the list, then the test app's document.
const answers = (...first: (() => Promise<Response>)[]) => {
	let n = 0;
	return () => first[n++]?.() ?? testAppDocument();
};

const never = () => new Promise<Response>(() => {});

const deferred = () => {
	let settle = {
		resolve: (_: Response) => {},
		reject: (_: unknown) => {},
	};
	const promise = new Promise<Response>((resolve, reject) => {
		settle = { resolve, reject };
	});
	return { promise, ...settle };
};

// A connect that is still waiting after 2 s answers "still waiting".
const within2s = (res: Response | Promise<Response>) =>
	Promise.race([res, Bun.sleep(2000).then(() => "still waiting")]);

const allowAnswer = (res: Response | string) => {
	if (typeof res === "string") return { waited: res };
	const location = new URL(
		res.headers.get("location") ?? "",
		"http://localhost:5173",
	);
	return {
		status: res.status,
		path: location.pathname,
		clientId: location.searchParams.get("client_id"),
	};
};

const documentFetches = (outside: ReturnType<typeof stubOutside> | undefined) =>
	outside?.calls.filter((c) => c.url.startsWith("https://client.example/"))
		.length ?? 0;

async function until(check: () => boolean) {
	while (!check()) await Bun.sleep(5);
}

describe("AI app sign-in", () => {
	let outside: ReturnType<typeof stubOutside> | undefined;
	afterEach(() => {
		setSystemTime();
	});

	const given = async (
		documents: Record<string, () => Response | Promise<Response>> = {},
	) => {
		const h = await makeHarness();
		outside = stubOutside({ documents });
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
		const { consent, jar } = await connectAiApp(h, { accept: false });
		// Then
		const { apps } = (await (
			await send(h, jar, "GET", "/api/ai-apps")
		).json()) as { apps: unknown[] };
		expect({
			url: consent.url,
			allows: apps.length,
		}).toEqual({
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
			apps: await count(h, schema.oauthClient),
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
			users: await count(h, schema.user),
			allows: await count(h, schema.oauthConsent),
		}).toEqual({
			status: 302,
			location: "/?error=signup_disabled",
			users: 0,
			allows: 0,
		});
	});
	test("starts a new download when the app's stuck one is past the time limit", async () => {
		// Given: four apps on one origin whose downloads never end, so they
		// hold all four of the origin's download slots; then 7 s pass
		const others = [2, 3, 4].map(
			(n) => `https://client.example/meta-${n}.json`,
		);
		const h = await given({
			[TEST_APP_ID]: answers(never),
			...Object.fromEntries(others.map((id) => [id, never])),
		});
		void authorize(h);
		for (const id of others) void authorize(h, withClient(id));
		await until(() => documentFetches(outside) === 4);
		setSystemTime(Date.now() + 7000);
		// When
		const res = await within2s(authorize(h));
		// Then
		expect(allowAnswer(res)).toEqual({
			status: 302,
			path: "/allow",
			clientId: "https://client.example/meta.json",
		});
	});

	test("stops waiting on a stuck download when the time limit passes", async () => {
		// Given: a download that never ends, 100 ms before its 6 s limit
		const h = await given({ [TEST_APP_ID]: answers(never) });
		const started = Date.now();
		void authorize(h);
		await until(() => documentFetches(outside) === 1);
		setSystemTime(started + 5900);
		// When
		const res = await within2s(authorize(h));
		// Then
		expect(allowAnswer(res)).toEqual({
			status: 302,
			path: "/allow",
			clientId: "https://client.example/meta.json",
		});
	});

	test("brings two connects waiting on one stuck download to the Allow page", async () => {
		// Given: a download that never ends, 100 ms before its 6 s limit; the
		// download that replaces it answers only when the test says
		const second = deferred();
		const h = await given({
			[TEST_APP_ID]: answers(never, () => second.promise),
		});
		const started = Date.now();
		void authorize(h);
		await until(() => documentFetches(outside) === 1);
		setSystemTime(started + 5900);
		// When: two connects wait on it at the same moment, and the new
		// download answers after both woke
		const both = Promise.all([within2s(authorize(h)), within2s(authorize(h))]);
		await until(() => documentFetches(outside) === 2);
		await Bun.sleep(50);
		second.resolve(testAppDocument());
		const answered = await both;
		// Then
		const allow = {
			status: 302,
			path: "/allow",
			clientId: "https://client.example/meta.json",
		};
		expect({
			answers: answered.map(allowAnswer),
			documentFetches: documentFetches(outside),
		}).toEqual({ answers: [allow, allow], documentFetches: 2 });
	});

	test("keeps the new download when the dropped one ends late", async () => {
		// Given: a stuck download; 7 s later a connect drops it and starts
		// its own, which is still running when the stuck one fails
		const first = deferred();
		const second = deferred();
		const h = await given({
			[TEST_APP_ID]: answers(
				() => first.promise,
				() => second.promise,
			),
		});
		const c1 = authorize(h);
		await until(() => documentFetches(outside) === 1);
		setSystemTime(Date.now() + 7000);
		void authorize(h);
		await until(() => documentFetches(outside) === 2);
		first.reject(new TypeError("network"));
		await c1;
		// When
		const c3 = within2s(authorize(h));
		second.resolve(testAppDocument());
		const res = await c3;
		// Then
		expect({
			answer: allowAnswer(res),
			documentFetches: documentFetches(outside),
		}).toEqual({
			answer: {
				status: 302,
				path: "/allow",
				clientId: "https://client.example/meta.json",
			},
			documentFetches: 2,
		});
	});
});
