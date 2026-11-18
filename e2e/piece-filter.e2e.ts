import type { Page } from "@playwright/test";
import { colourIds, postBrand, postOwnedItems } from "./closet-helpers";
import { expect, test } from "./fixtures";
import { postShopLink, postWish } from "./wishlist-helpers";

const mainNav = (page: Page) => page.getByRole("navigation", { name: "Main" });

const closetTiles = (page: Page) => page.locator('[data-slot="closet-tile"]');

const wishTiles = (page: Page) => page.locator('[data-slot="wish-tile"]');

const chips = (page: Page) => page.locator('[data-slot="filter-chip"]');

const activeFilters = (page: Page) =>
	page.getByRole("group", { name: "Active filters" });

const noMatch = (page: Page) => page.locator('[data-slot="no-match"]');

const tileNames = (tiles: ReturnType<typeof closetTiles>) =>
	tiles.evaluateAll((links) => links.map((l) => l.getAttribute("aria-label")));

// The sheet keeps one dialog; its name is the step's title.
const sheet = (page: Page) => page.getByRole("dialog");

// A Radix toggle group with more than one pick is a toolbar.
const group = (page: Page, name: "Type" | "Colour" | "Brand") =>
	sheet(page).getByRole("toolbar", { name });

const pick = (page: Page, name: "Type" | "Colour" | "Brand", item: string) =>
	group(page, name).getByRole("button", { name: item, exact: true }).click();

const openFilter = (page: Page) =>
	page.getByRole("button", { name: "Filter", exact: true }).click();

const show = (page: Page, text: string) =>
	sheet(page).getByRole("button", { name: text, exact: true }).click();

async function pickTypes(page: Page, ...names: string[]) {
	await sheet(page).getByRole("button", { name: "Pick a type" }).click();
	for (const name of names)
		await sheet(page).getByRole("button", { name, exact: true }).click();
	await sheet(page).getByRole("button", { name: "Back" }).click();
}

const typeOfTile = (href: string | null) => href?.split("/")[2];

// Owned items, oldest first, each one of its kind.
async function seedCloset(
	page: Page,
	items: [typeId: string, colour: string, brandId: string | null][],
) {
	const ids = await colourIds(page);
	await postOwnedItems(
		page,
		...items.map(([typeId, colour, brandId]) => ({
			typeId,
			colourId: ids[colour],
			brandId,
			quantity: 1,
		})),
	);
	return ids;
}

// Oldest first: a Navy sweater with a COS link and a link of no brand, a
// White long tee with a Uniqlo link, Navy chino pants with no link.
async function seedWishlist(page: Page) {
	const cos = await postBrand(page, "COS");
	const uniqlo = await postBrand(page, "Uniqlo");
	const ids = await colourIds(page);
	const link = (brandId: string | null) => ({
		url: "https://shop.example/a",
		brandId,
		name: "A piece",
		price: null,
	});
	const sweater = await postWish(page, {
		typeId: "sweater",
		colourId: ids.Navy,
	});
	await postShopLink(page, sweater, link(cos));
	await postShopLink(page, sweater, link(null));
	const tee = await postWish(page, { typeId: "tee_l", colourId: ids.White });
	await postShopLink(page, tee, link(uniqlo));
	await postWish(page, { typeId: "chino_p", colourId: ids.Navy });
}

test("shows the three groups of the Filter sheet", async ({ page }) => {
	// Given: both projects, a fresh account with COS and Uniqlo, and a Navy
	// sweater from COS
	const cos = await postBrand(page, "COS");
	await postBrand(page, "Uniqlo");
	await seedCloset(page, [["sweater", "Navy", cos]]);
	await page.goto("/closet");
	// When
	await openFilter(page);
	await pickTypes(page, "Long tee");
	// Then
	await expect(sheet(page)).toHaveAccessibleName("Filter");
	expect({
		type: await group(page, "Type").getByRole("button").allTextContents(),
		colours: await group(page, "Colour").getByRole("button").count(),
		brand: await group(page, "Brand").getByRole("button").allTextContents(),
	}).toEqual({
		type: ["Bottoms", "Inner tops", "Sweaters", "Jackets", "Long tee"],
		colours: 13,
		brand: ["COS", "Uniqlo", "No brand"],
	});
});

test("filters the closet by type and colour at once, with chips and a count", async ({
	page,
}) => {
	// Given: both projects, oldest first: a Navy sweater from COS, a Navy long
	// tee, a White long tee, Navy chino pants
	const cos = await postBrand(page, "COS");
	await seedCloset(page, [
		["sweater", "Navy", cos],
		["tee_l", "Navy", null],
		["tee_l", "White", null],
		["chino_p", "Navy", null],
	]);
	await page.goto("/closet");
	// When
	await openFilter(page);
	await pickTypes(page, "Sweater", "Long tee");
	await pick(page, "Colour", "Navy");
	await show(page, "Show 2 pieces");
	// Then
	await expect(closetTiles(page)).toHaveCount(2);
	expect({
		tiles: await tileNames(closetTiles(page)),
		chips: await chips(page).allTextContents(),
		last: await activeFilters(page).getByRole("button").last().textContent(),
		shown: await page.locator('[data-slot="filter-shown"]').textContent(),
		count: await page.locator('[data-slot="filter-count"]').textContent(),
	}).toEqual({
		tiles: ["Navy long tee, 1", "Navy sweater, 1"],
		chips: ["Long tee", "Sweater", "Navy"],
		last: "Clear all",
		shown: "2 pieces",
		count: "3",
	});
});

test("removes one chip by its cross and all by Clear all", async ({ page }) => {
	// Given: both projects, the closet of the test above, filtered by Sweater,
	// Long tee, and Navy
	const cos = await postBrand(page, "COS");
	const ids = await seedCloset(page, [
		["sweater", "Navy", cos],
		["tee_l", "Navy", null],
		["tee_l", "White", null],
		["chino_p", "Navy", null],
	]);
	await page.goto(`/closet?type=sweater&type=tee_l&colour=${ids.Navy}`);
	await expect(closetTiles(page)).toHaveCount(2);
	// When
	await page.getByRole("button", { name: "Remove Navy" }).click();
	await expect(closetTiles(page)).toHaveCount(3);
	const afterCross = await tileNames(closetTiles(page));
	await activeFilters(page).getByRole("button", { name: "Clear all" }).click();
	await expect(closetTiles(page)).toHaveCount(4);
	// Then
	expect({
		afterCross,
		afterClear: await closetTiles(page).count(),
		chips: await chips(page).count(),
	}).toEqual({
		afterCross: ["White long tee, 1", "Navy long tee, 1", "Navy sweater, 1"],
		afterClear: 4,
		chips: 0,
	});
});

test("shows Nothing here on the closet and clears it", async ({ page }) => {
	// Given: both projects, a Navy sweater
	await seedCloset(page, [["sweater", "Navy", null]]);
	await page.goto("/closet");
	// When
	await openFilter(page);
	await pick(page, "Type", "Jackets");
	await show(page, "Show 0 pieces");
	const title = noMatch(page).getByRole("heading", { name: "Nothing here" });
	await expect(title).toBeVisible();
	const before = {
		title: await title.textContent(),
		tiles: await closetTiles(page).count(),
	};
	await noMatch(page).getByRole("button", { name: "Clear all" }).click();
	await expect(closetTiles(page)).toHaveCount(1);
	// Then
	expect({
		before,
		after: {
			tiles: await closetTiles(page).count(),
			chips: await chips(page).count(),
		},
	}).toEqual({
		before: { title: "Nothing here", tiles: 0 },
		after: { tiles: 1, chips: 0 },
	});
});

test("drops a deleted brand from the closet filter", async ({ page }) => {
	// Given: both projects, a Navy sweater from COS and a White long tee, the
	// closet filtered by COS
	const cos = await postBrand(page, "COS");
	await seedCloset(page, [
		["sweater", "Navy", cos],
		["tee_l", "White", null],
	]);
	await page.goto(`/closet?brand=${cos}`);
	await expect(closetTiles(page)).toHaveCount(1);
	// When
	await mainNav(page).getByRole("link", { name: "Labels" }).click();
	await page.getByRole("tab", { name: "Brands" }).click();
	await page.getByRole("button", { name: "COS" }).click();
	await page
		.getByRole("dialog", { name: "Edit brand" })
		.getByRole("button", { name: "Delete" })
		.click();
	await page
		.getByRole("dialog", { name: "Delete this brand?" })
		.getByRole("button", { name: "Delete" })
		.click();
	await expect(page.locator('[data-slot="toast"]')).toHaveText("Brand deleted");
	await page.goBack();
	await expect(closetTiles(page)).toHaveCount(2);
	// Then
	expect({
		chips: await chips(page).count(),
		tiles: await closetTiles(page).count(),
	}).toEqual({ chips: 0, tiles: 2 });
});

test("filters the wishlist by the brands of its shop links", async ({
	page,
}) => {
	// Given: both projects, the three wishes of seedWishlist
	await seedWishlist(page);
	await page.goto("/wishlist");
	await expect(wishTiles(page)).toHaveCount(3);
	// When
	await openFilter(page);
	await pick(page, "Brand", "No brand");
	await show(page, "Show 1 piece");
	await expect(wishTiles(page)).toHaveCount(1);
	const noBrand = await wishTiles(page).evaluateAll((links) =>
		links.map((l) => l.getAttribute("href")),
	);
	await page.getByRole("button", { name: "Remove No brand" }).click();
	await openFilter(page);
	await pick(page, "Brand", "Uniqlo");
	await show(page, "Show 1 piece");
	await expect(wishTiles(page)).toHaveCount(1);
	const uniqlo = await wishTiles(page).evaluateAll((links) =>
		links.map((l) => l.getAttribute("href")),
	);
	// Then
	expect({
		noBrand: noBrand.map(typeOfTile),
		uniqlo: uniqlo.map(typeOfTile),
	}).toEqual({ noBrand: ["sweater"], uniqlo: ["tee_l"] });
});

test("filters the wishlist by type and colour at once", async ({ page }) => {
	// Given: both projects, the three wishes of seedWishlist
	await seedWishlist(page);
	await page.goto("/wishlist");
	await expect(wishTiles(page)).toHaveCount(3);
	// When
	await openFilter(page);
	await pick(page, "Type", "Sweaters");
	await pick(page, "Type", "Inner tops");
	await pick(page, "Colour", "Navy");
	await show(page, "Show 1 piece");
	await expect(wishTiles(page)).toHaveCount(1);
	// Then
	expect({
		tiles: await wishTiles(page).count(),
		chips: await chips(page).allTextContents(),
		count: await page.locator('[data-slot="filter-count"]').textContent(),
	}).toEqual({
		tiles: 1,
		chips: ["Inner tops", "Sweaters", "Navy"],
		count: "3",
	});
});

test("shows Nothing here on the wishlist and clears it", async ({ page }) => {
	// Given: both projects, the three wishes of seedWishlist, filtered by
	// Jackets
	await seedWishlist(page);
	await page.goto("/wishlist?layer=jacket");
	const title = noMatch(page).getByRole("heading", { name: "Nothing here" });
	await expect(title).toBeVisible();
	const before = {
		title: await title.textContent(),
		tiles: await wishTiles(page).count(),
	};
	// When
	await noMatch(page).getByRole("button", { name: "Clear all" }).click();
	await expect(wishTiles(page)).toHaveCount(3);
	// Then
	expect({
		before,
		after: {
			tiles: await wishTiles(page).count(),
			chips: await chips(page).count(),
		},
	}).toEqual({
		before: { title: "Nothing here", tiles: 0 },
		after: { tiles: 3, chips: 0 },
	});
});

test("keeps the closet filter after a piece and Back, and not on the wishlist", async ({
	page,
}) => {
	// Given: both projects, a Navy sweater and a White long tee, a wish for
	// Navy chino pants, the closet filtered by Sweaters
	const ids = await seedCloset(page, [
		["sweater", "Navy", null],
		["tee_l", "White", null],
	]);
	await postWish(page, { typeId: "chino_p", colourId: ids.Navy });
	await page.goto("/closet?layer=sweater");
	await expect(closetTiles(page)).toHaveCount(1);
	// When
	await page.getByRole("link", { name: "Navy sweater, 1" }).click();
	await page.getByRole("link", { name: "Back" }).click();
	await expect(closetTiles(page)).toHaveCount(1);
	const closet = await chips(page).allTextContents();
	await mainNav(page).getByRole("link", { name: "Wishlist" }).click();
	await expect(wishTiles(page)).toHaveCount(1);
	// Then
	expect({
		closet,
		wishlistChips: await chips(page).count(),
		wishlistTiles: await wishTiles(page).count(),
	}).toEqual({ closet: ["Sweaters"], wishlistChips: 0, wishlistTiles: 1 });
});

test("shows Could not load your brands in the Filter sheet and loads them on Retry", async ({
	page,
}) => {
	// Given: both projects, a Navy sweater from COS; each GET /api/brands
	// answered 500 until Retry
	const cos = await postBrand(page, "COS");
	await seedCloset(page, [["sweater", "Navy", cos]]);
	let failing = true;
	await page.route("**/api/brands", (route) => {
		if (!failing || route.request().method() !== "GET") return route.continue();
		return route.fulfill({ status: 500 });
	});
	await page.goto("/closet");
	// When
	await openFilter(page);
	const alert = sheet(page).getByRole("alert");
	await expect(alert).toBeVisible();
	const failed = await alert.textContent();
	failing = false;
	await sheet(page).getByRole("button", { name: "Retry" }).click();
	await expect(group(page, "Brand")).toBeVisible();
	// Then
	expect({
		failed,
		brand: await group(page, "Brand").getByRole("button").allTextContents(),
	}).toEqual({
		failed: "Could not load your brands",
		brand: ["COS", "No brand"],
	});
});

test("keeps the filter of an empty closet in sight", async ({ page }) => {
	// Given: both projects, a fresh account with an empty closet, its address
	// filtered by Sweaters
	await page.goto("/closet?layer=sweater");
	await expect(
		page.getByRole("heading", { name: "Nothing in your closet yet" }),
	).toBeVisible();
	// When
	const shown = {
		chips: await chips(page).allTextContents(),
		count: await page.locator('[data-slot="filter-count"]').textContent(),
	};
	// Then
	expect(shown).toEqual({ chips: ["Sweaters"], count: "1" });
});
