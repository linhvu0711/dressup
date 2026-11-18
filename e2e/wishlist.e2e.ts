import type { Page } from "@playwright/test";
import { colourIds } from "./closet-helpers";
import { expect, test } from "./fixtures";
import { postShopLink, postWish } from "./wishlist-helpers";

const mainNav = (page: Page) => page.getByRole("navigation", { name: "Main" });

const tiles = (page: Page) => page.locator('[data-slot="wish-tile"]');

test("opens the wishlist from the Wishlist tab", async ({ page }) => {
	// Given: a fresh account on /closet
	await page.goto("/closet");
	// When
	await mainNav(page).getByRole("link", { name: "Wishlist" }).click();
	// Then
	await expect(page).toHaveURL("/wishlist");
	await expect(
		page.getByRole("heading", { name: "Wishlist", exact: true }),
	).toBeVisible();
	await expect(mainNav(page).getByRole("link")).toHaveText([
		"Dress",
		"Looks",
		"Combinations",
		"Closet",
		"Wishlist",
		"Labels",
	]);
});

test("shows one tile for each wish, newest first, with its links", async ({
	page,
}) => {
	// Given: a fresh account with a Beige chino pants wish holding links at
	// 588.000 and 790.000, then a Charcoal wool jacket wish with none
	await page.goto("/");
	const ids = await colourIds(page);
	const chinos = await postWish(page, {
		typeId: "chino_p",
		colourId: ids.Beige,
	});
	for (const price of [588000, 790000])
		await postShopLink(page, chinos, {
			url: "https://www.uniqlo.com/vn/en/chino-pants",
			brandId: null,
			name: "Chino pants",
			price,
		});
	await postWish(page, { typeId: "wool", colourId: ids.Charcoal });
	// When
	await page.goto("/wishlist");
	// Then
	await expect(tiles(page)).toHaveCount(2);
	expect(
		await tiles(page).evaluateAll((links) =>
			links.map((link) => link.getAttribute("aria-label")),
		),
	).toEqual([
		"Charcoal wool jacket, No link yet",
		"Beige chino pants, 2 links · from 588.000 ₫",
	]);
});

test("shows skeleton tiles while the wishlist loads", async ({ page }) => {
	// Given: GET /api/wishes held until the test lets it go
	let release = () => {};
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	await page.route("**/api/wishes", async (route) => {
		await held;
		await route.continue();
	});
	// When
	await page.goto("/wishlist");
	// Then
	await expect(page.locator('[data-slot="wish-skeleton"]')).toHaveCount(6);
	release();
	await expect(page.locator('[data-slot="wish-skeleton"]')).toHaveCount(0);
});

test("shows Could not load your wishlist and loads on Retry", async ({
	page,
}) => {
	// Given: the first GET /api/wishes answered 500, the next passed on
	let failed = false;
	await page.route("**/api/wishes", (route) => {
		if (failed) return route.continue();
		failed = true;
		return route.fulfill({ status: 500 });
	});
	// When
	await page.goto("/wishlist");
	// Then
	await expect(
		page.getByRole("heading", { name: "Could not load your wishlist" }),
	).toBeVisible();
	// When
	await page.getByRole("button", { name: "Retry" }).click();
	// Then
	await expect(
		page.getByRole("heading", { name: "Nothing on your wishlist yet" }),
	).toBeVisible();
});

test("shows the sign-in screen when the wishlist answers 401", async ({
	page,
}) => {
	// Given: / open; then the session is gone for the session check and for
	// the wishlist
	await page.goto("/");
	await expect(mainNav(page)).toBeVisible();
	const noSession = { status: 401, json: { error: "unauthorized" } };
	await page.route("/api/me", (route) => route.fulfill(noSession));
	await page.route("**/api/wishes", (route) => route.fulfill(noSession));
	// When
	await mainNav(page).getByRole("link", { name: "Wishlist" }).click();
	// Then
	await expect(
		page.getByRole("button", { name: "Sign in with Google" }),
	).toBeVisible();
});
