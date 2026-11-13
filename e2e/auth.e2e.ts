import { expect, test } from "@playwright/test";

const signedOut = { cookies: [], origins: [] };

test.describe("without a session", () => {
	test.use({ storageState: signedOut });

	test("shows the sign-in screen at every address without a session", async ({
		page,
	}) => {
		for (const path of ["/", "/looks", "/settings", "/nope"]) {
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
});

test("shows the Dress page with a session", async ({ page }) => {
	// Given: the config's session for e2e-user
	// When
	await page.goto("/");
	// Then
	await expect(page.locator("h1")).toHaveText("Dress");
	const me = await page.request.get("/api/me");
	expect(me.status()).toBe(200);
	const body = await me.json();
	expect({ id: body.id, email: body.email }).toEqual({
		id: "e2e-user",
		email: "e2e@dressup.test",
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
	await expect(page.locator("h1")).toHaveText("Dress");
});
