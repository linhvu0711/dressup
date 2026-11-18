import type { Page } from "@playwright/test";
import { colourIds, postBrand, postOwnedItems } from "./closet-helpers";
import { expect, test } from "./fixtures";

const mainNav = (page: Page) => page.getByRole("navigation", { name: "Main" });

const tiles = (page: Page) => page.locator('[data-slot="closet-tile"]');

test("opens the closet from the Closet tab", async ({ page }) => {
	// Given: a fresh account, the Dress page open
	await page.goto("/");
	// When
	await mainNav(page).getByRole("link", { name: "Closet" }).click();
	// Then
	await expect(page).toHaveURL("/closet");
	await expect(page.getByRole("heading", { name: "Closet" })).toBeVisible();
	await expect(mainNav(page).getByRole("link")).toHaveText([
		"Dress",
		"Looks",
		"Combinations",
		"Closet",
		"Labels",
	]);
});

test("shows Nothing in your closet yet with a button to the form", async ({
	page,
}) => {
	// Given: a fresh account
	// When
	await page.goto("/closet");
	// Then
	await expect(
		page.getByRole("heading", { name: "Nothing in your closet yet" }),
	).toBeVisible();
	await expect(
		page.getByRole("main").getByRole("button", {
			name: "Add to closet",
			exact: true,
		}),
	).toHaveCount(2);
});

test("shows one tile for each piece, newest first, with its total", async ({
	page,
}) => {
	// Given: a fresh account with Zara and COS; Navy long button-up Zara 2,
	// White short tee 1, Navy long button-up COS 3, in that order
	await page.goto("/");
	const ids = await colourIds(page);
	const zara = await postBrand(page, "Zara");
	const cos = await postBrand(page, "COS");
	await postOwnedItems(
		page,
		{ typeId: "shirt_l", colourId: ids.Navy, brandId: zara, quantity: 2 },
		{ typeId: "tee_s", colourId: ids.White, brandId: null, quantity: 1 },
		{ typeId: "shirt_l", colourId: ids.Navy, brandId: cos, quantity: 3 },
	);
	// When
	await page.goto("/closet");
	// Then
	await expect(tiles(page)).toHaveCount(2);
	expect(
		await tiles(page).evaluateAll((links) =>
			links.map((link) => link.getAttribute("aria-label")),
		),
	).toEqual(["Navy long button-up, 5", "White short tee, 1"]);
});

test("shows skeleton tiles while the closet loads", async ({ page }) => {
	// Given: GET /api/owned-items held until the test lets it go
	let release = () => {};
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	await page.route("**/api/owned-items", async (route) => {
		await held;
		await route.continue();
	});
	// When
	await page.goto("/closet");
	// Then
	await expect(page.locator('[data-slot="closet-skeleton"]')).toHaveCount(6);
	release();
	await expect(page.locator('[data-slot="closet-skeleton"]')).toHaveCount(0);
});

test("shows Could not load your closet and loads on Retry", async ({
	page,
}) => {
	// Given: a fresh account with one item; the first GET /api/owned-items
	// answered 500, the next passed on
	await page.goto("/");
	const ids = await colourIds(page);
	await postOwnedItems(page, {
		typeId: "tee_s",
		colourId: ids.White,
		brandId: null,
		quantity: 1,
	});
	let failed = false;
	await page.route("**/api/owned-items", (route) => {
		if (failed) return route.continue();
		failed = true;
		return route.fulfill({ status: 500 });
	});
	// When
	await page.goto("/closet");
	// Then
	await expect(
		page.getByRole("heading", { name: "Could not load your closet" }),
	).toBeVisible();
	// When
	await page.getByRole("button", { name: "Retry" }).click();
	// Then
	await expect(tiles(page)).toHaveCount(1);
});

test("shows the sign-in screen when the closet answers 401", async ({
	page,
}) => {
	// Given: / open; then the session is gone for the session check and for
	// the closet
	await page.goto("/");
	await expect(mainNav(page)).toBeVisible();
	const noSession = { status: 401, json: { error: "unauthorized" } };
	await page.route("/api/me", (route) => route.fulfill(noSession));
	await page.route("**/api/owned-items", (route) => route.fulfill(noSession));
	// When
	await mainNav(page).getByRole("link", { name: "Closet" }).click();
	// Then
	await expect(
		page.getByRole("button", { name: "Sign in with Google" }),
	).toBeVisible();
});
