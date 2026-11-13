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
