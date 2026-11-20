import { readFileSync } from "node:fs";
import { expect, test } from "./fixtures";
import { SESSION_FILE, signOutFile } from "./paths";

const signedOut = { cookies: [], origins: [] };

test.describe("without a session", () => {
	test.use({ storageState: signedOut });

	test("shows the sign-in screen at every address without a session", async ({
		page,
	}) => {
		for (const path of ["/", "/combinations", "/settings", "/nope"]) {
			// Given: no session
			// When
			await page.goto(path);
			// Then
			await expect(page.locator("h1")).toHaveText("dressup");
			await expect(
				page.getByText(
					"See your clothes in your colours, before you put them on.",
				),
			).toBeVisible();
			await expect(
				page.getByRole("button", { name: "Sign in with Google" }),
			).toBeVisible();
			await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(
				0,
			);
			await expect(page).toHaveURL(path);
		}
	});

	test("sends the Google button to Google", async ({ page }) => {
		// Given: no session; the request to Google is caught, not sent
		let googleUrl = "";
		await page.route("https://accounts.google.com/**", (route) => {
			googleUrl = route.request().url();
			return route.abort();
		});
		await page.goto("/");
		// When
		await page.getByRole("button", { name: "Sign in with Google" }).click();
		// Then
		await expect.poll(() => googleUrl).not.toBe("");
		const url = new URL(googleUrl);
		expect({
			path: url.pathname,
			redirectUri: url.searchParams.get("redirect_uri"),
		}).toEqual({
			path: "/o/oauth2/v2/auth",
			redirectUri: "http://localhost:5173/api/auth/callback/google",
		});
	});

	test("shows the error line after a failed sign-in", async ({ page }) => {
		// Given: no session
		// When
		await page.goto("/?error=access_denied");
		// Then
		const alert = page.getByRole("alert");
		await expect(alert).toHaveText("Sign-in did not work. Try again.");
		const button = await page
			.getByRole("button", { name: "Sign in with Google" })
			.boundingBox();
		const line = await alert.boundingBox();
		expect((line?.y ?? 0) >= (button?.y ?? 0) + (button?.height ?? 0)).toBe(
			true,
		);
	});

	test("shows No new accounts for now after a closed sign-up", async ({
		page,
	}) => {
		// Given: no session
		// When
		await page.goto("/?error=signup_disabled");
		// Then
		await expect(page.locator("h2")).toHaveText("No new accounts for now");
		await expect(
			page.getByText(
				"The app is full at the moment. If you have an account, you can sign in.",
			),
		).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Sign in with Google" }),
		).toBeVisible();
		await expect(page.getByRole("alert")).toHaveCount(0);
	});
});

// This test checks the account is the shared E2E user, so it keeps that
// session in place of a pool account. It only reads.
test.describe("the shared session", () => {
	test.use({ storageState: SESSION_FILE });

	test("shows the Combinations page with a session", async ({ page }) => {
		// Given: the config's session for e2e-user
		// When
		await page.goto("/");
		// Then
		await expect(page.locator("h1")).toHaveText("Combinations");
		const me = await page.request.get("/api/me");
		expect(me.status()).toBe(200);
		const body = await me.json();
		expect({ id: body.id, email: body.email }).toEqual({
			id: "e2e-user",
			email: "e2e@dressup.test",
		});
	});
});

test("shows the empty shell while the session is checked", async ({ page }) => {
	// Given: GET /api/me held until the test lets it go
	let release = () => {};
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	await page.route("/api/me", async (route) => {
		await held;
		await route.continue();
	});
	// When
	await page.goto("/");
	// Then
	await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
	await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(1);
	await expect(page.locator("h1")).toHaveCount(0);
	await expect(
		page.getByRole("button", { name: "Sign in with Google" }),
	).toHaveCount(0);
	release();
	await expect(page.locator("h1")).toHaveText("Combinations");
});

test.describe("sign out", () => {
	test.use({ storageState: signedOut });

	test("signs out from Settings", async ({ page, context }, testInfo) => {
		// Given: this project's own session, so the shared one stays
		const cookies = JSON.parse(
			readFileSync(signOutFile(testInfo.project.name, "settings"), "utf8"),
		);
		await context.addCookies(cookies);
		const token = cookies.find(
			(c: { name: string }) => c.name === "better-auth.session_token",
		).value;
		await page.goto("/");
		// When
		await page.getByRole("link", { name: "Settings" }).click();
		await expect(page.getByText("e2e@dressup.test")).toBeVisible();
		await expect(page.getByText("Signed in with Google")).toBeVisible();
		await page.getByRole("button", { name: "Sign out" }).click();
		// Then
		await expect(page.locator("h1")).toHaveText("dressup");
		await expect(
			page.getByRole("button", { name: "Sign in with Google" }),
		).toBeVisible();
		await expect(page).toHaveURL("/");
		const me = await page.request.get("/api/me", {
			headers: { cookie: `better-auth.session_token=${token}` },
		});
		expect(me.status()).toBe(401);
	});
	test("stays signed out when an older session check answers late", async ({
		page,
		context,
	}, testInfo) => {
		// Given: the session check that opening Settings sends, held until
		// after Sign out
		await context.addCookies(
			JSON.parse(
				readFileSync(signOutFile(testInfo.project.name, "late-check"), "utf8"),
			),
		);
		await page.goto("/");
		await expect(page.locator("h1")).toHaveText("Combinations");
		let release = () => {};
		const held = new Promise<void>((resolve) => {
			release = resolve;
		});
		let caught = () => {};
		const checkSent = new Promise<void>((resolve) => {
			caught = resolve;
		});
		await page.route("/api/me", async (route) => {
			const { cookie } = await route.request().allHeaders();
			caught();
			await held;
			// continue() would take the cookies from the browser, which sign-out
			// cleared; a real request left earlier, with the old ones.
			const response = await page.request.get("/api/me", {
				headers: { cookie },
			});
			await route.fulfill({ response });
		});
		await page.getByRole("link", { name: "Settings" }).click();
		await checkSent;
		// When
		await page.getByRole("button", { name: "Sign out" }).click();
		await expect(page.locator("h1")).toHaveText("dressup");
		const late = page.waitForResponse("**/api/me");
		release();
		// Then: the late check still says signed in, from the cookie cache
		expect((await late).status()).toBe(200);
		// The app reads the answer a few ticks after it arrives; before the fix
		// the shell came back well inside this time.
		await page.waitForTimeout(500);
		await expect(page.locator("h1")).toHaveText("dressup");
		await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
	});
});
