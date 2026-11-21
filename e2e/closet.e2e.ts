import type { Page } from "@playwright/test";
import { postOwnedItems } from "./closet-helpers";
import { expect, test } from "./fixtures";
import { colourIds, postBrand } from "./label-helpers";
import { sheet, toast } from "./locators";
import { CLOSET_FULL_FILE } from "./paths";

const mainNav = (page: Page) => page.getByRole("navigation", { name: "Main" });

const tiles = (page: Page) => page.locator('[data-slot="closet-tile"]');

const addSheet = (page: Page) => sheet(page, "Add to closet");

// The header's "+", which comes before the empty notice's button.
const openAddSheet = (page: Page) =>
	page
		.getByRole("button", { name: "Add to closet", exact: true })
		.first()
		.click();

// Picks Long button-up and Navy in the open add sheet.
async function pickNavyShirt(page: Page) {
	await addSheet(page).getByRole("button", { name: "Pick a type" }).click();
	await sheet(page, "Pick a type")
		.getByRole("button", { name: "Long button-up", exact: true })
		.click();
	await addSheet(page)
		.getByRole("radiogroup", { name: "Colour" })
		.getByRole("radio", { name: "Navy", exact: true })
		.click();
}

test("opens the closet from the Closet tab", async ({ page }) => {
	// Given: a fresh account, the Combinations page open
	await page.goto("/combinations");
	// When
	await mainNav(page).getByRole("link", { name: "Closet" }).click();
	// Then
	await expect(page).toHaveURL("/closet");
	await expect(
		page.getByRole("heading", { name: "Closet", exact: true }),
	).toBeVisible();
	await expect(mainNav(page).getByRole("link")).toHaveText([
		"Combinations",
		"Closet",
		"Wishlist",
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

test("swaps the sheet to the type list and back", async ({ page }) => {
	// Given: a fresh account on /closet
	await page.goto("/closet");
	// When
	await openAddSheet(page);
	await addSheet(page).getByRole("button", { name: "Pick a type" }).click();
	// Then
	const types = sheet(page, "Pick a type");
	const typeButtons = types.locator('[data-slot="type-option"]');
	await expect(typeButtons).toHaveCount(17);
	await expect(typeButtons.first()).toHaveAccessibleName("Short tee");
	await expect(types.getByRole("button", { name: "Back" })).toBeVisible();
});

test("adds an item from the form and shows its tile", async ({ page }) => {
	// Given: a fresh account on /closet
	await page.goto("/closet");
	// When
	await openAddSheet(page);
	await pickNavyShirt(page);
	await addSheet(page).getByRole("button", { name: "More" }).click();
	await addSheet(page).getByRole("button", { name: "Save" }).click();
	// Then
	await expect(toast(page)).toHaveText("Added to your closet");
	await expect(tiles(page)).toHaveCount(1);
	await expect(tiles(page)).toHaveAccessibleName("Navy long button-up, 2");
});

test("adds the same piece and brand a second time", async ({ page }) => {
	// Given: a fresh account with a Navy long button-up, no brand
	await page.goto("/");
	const ids = await colourIds(page);
	await postOwnedItems(page, {
		typeId: "shirt_l",
		colourId: ids.Navy,
		brandId: null,
		quantity: 1,
	});
	await page.goto("/closet");
	// When
	await openAddSheet(page);
	await pickNavyShirt(page);
	await addSheet(page).getByRole("button", { name: "Save" }).click();
	await expect(toast(page)).toHaveText("Added to your closet");
	await tiles(page).click();
	// Then
	await expect(itemRows(page)).toHaveCount(2);
	await expect(itemRows(page).nth(0)).toHaveAccessibleName("No brand × 1");
	await expect(itemRows(page).nth(1)).toHaveAccessibleName("No brand × 1");
});

test("takes only whole numbers from 1 to 99 for the quantity", async ({
	page,
}) => {
	// Given: a fresh account; the sheet open
	await page.goto("/closet");
	await openAddSheet(page);
	// When
	const box = addSheet(page).getByLabel("Quantity");
	await box.selectText();
	await box.pressSequentially("x9y9z9");
	// Then
	await expect(box).toHaveValue("99");
	await expect(
		addSheet(page).getByRole("button", { name: "More" }),
	).toBeDisabled();
});

test("keeps the form open with Not saved when the save fails", async ({
	page,
}) => {
	// Given: a fresh account; the save answers 500
	await page.route("**/api/owned-items", (route) =>
		route.request().method() === "POST"
			? route.fulfill({ status: 500 })
			: route.continue(),
	);
	await page.goto("/closet");
	// When
	await openAddSheet(page);
	await pickNavyShirt(page);
	await addSheet(page).getByRole("button", { name: "Save" }).click();
	// Then
	await expect(addSheet(page).getByRole("alert")).toHaveText(
		"Not saved. Try again.",
	);
});

test.describe("at the closet limit", () => {
	test.use({ storageState: CLOSET_FULL_FILE });

	test("turns Save off and shows the limit hint at 500 items", async ({
		page,
	}) => {
		// Given: the account with 500 items
		// When
		await page.goto("/closet");
		await openAddSheet(page);
		// Then
		await expect(addSheet(page).getByRole("alert")).toHaveText(
			"You have 500 items. That is the limit. Delete one to add a new one.",
		);
		await expect(
			addSheet(page).getByRole("button", { name: "Save" }),
		).toBeDisabled();
	});
	const openWall = async (page: Page) => {
		await page.goto("/closet");
		await expect(tiles(page).first().locator("svg")).toHaveCount(1);
	};

	test("draws only the tiles near the screen", async ({ page }) => {
		// Given: both projects, the account with 500 items in 167 tiles
		// When
		await openWall(page);
		// Then
		const count = await tiles(page)
			.filter({ has: page.locator("svg") })
			.count();
		expect(count).toBeGreaterThanOrEqual(1);
		expect(count).toBeLessThanOrEqual(60);
	});

	test("draws a far tile when it scrolls near and drops the first one", async ({
		page,
	}) => {
		// Given: both projects, the account with 500 items in 167 tiles, the wall open with the first tile
		// drawn
		await openWall(page);
		const last = page.getByRole("link", { name: "Brown casual shorts, 2" });
		// When
		await last.scrollIntoViewIfNeeded();
		// Then
		await expect(last.locator("svg")).toHaveCount(1);
		await expect(
			page.getByRole("link", { name: "White short tee, 3" }).locator("svg"),
		).toHaveCount(0);
	});

	test("keeps every tile on the page", async ({ page }) => {
		// Given: both projects, the account with 500 items in 167 tiles
		// When
		await openWall(page);
		// Then
		await expect(tiles(page)).toHaveCount(167);
		await expect(
			page.getByRole("link", { name: "Brown casual shorts, 2" }),
		).toBeAttached();
	});
});

const itemRows = (page: Page) =>
	page
		.getByRole("region", { name: "In your closet" })
		.locator('[data-slot="item-row"]');

test("opens the piece page from a tile", async ({ page }) => {
	// Given: a fresh account with Zara; Navy long button-up Zara 2, then Navy
	// long button-up no brand 1
	await page.goto("/");
	const ids = await colourIds(page);
	const zara = await postBrand(page, "Zara");
	await postOwnedItems(
		page,
		{ typeId: "shirt_l", colourId: ids.Navy, brandId: zara, quantity: 2 },
		{ typeId: "shirt_l", colourId: ids.Navy, brandId: null, quantity: 1 },
	);
	// When
	await page.goto("/closet");
	await page.getByRole("link", { name: "Navy long button-up, 3" }).click();
	// Then
	await expect(page).toHaveURL(`/piece/shirt_l/${ids.Navy}`);
	await expect(
		page.getByRole("heading", { name: "Navy long button-up" }),
	).toBeVisible();
	await expect(
		page.getByRole("heading", { name: "In your closet" }),
	).toBeVisible();
	await expect(itemRows(page)).toHaveCount(2);
	expect(
		await itemRows(page).evaluateAll((rows) =>
			rows.map((row) => row.getAttribute("aria-label")),
		),
	).toEqual(["No brand × 1", "Zara × 2"]);
});

test("sends a piece page with no item back to the closet", async ({ page }) => {
	// Given: a fresh account with no items
	// When
	await page.goto("/piece/shirt_l/00000000-0000-4000-8000-000000000000");
	// Then
	await expect(page).toHaveURL("/closet");
});

const editSheet = (page: Page) => sheet(page, "Edit item");

test("changes an item's quantity", async ({ page }) => {
	// Given: a fresh account with a Navy long button-up, no brand, 2; the
	// piece page open
	await page.goto("/");
	const ids = await colourIds(page);
	await postOwnedItems(page, {
		typeId: "shirt_l",
		colourId: ids.Navy,
		brandId: null,
		quantity: 2,
	});
	await page.goto(`/piece/shirt_l/${ids.Navy}`);
	// When
	await page.getByRole("button", { name: "No brand × 2" }).click();
	await editSheet(page).getByRole("button", { name: "More" }).click();
	await editSheet(page).getByRole("button", { name: "Save" }).click();
	// Then
	await expect(toast(page)).toHaveText("Changes saved");
	await expect(itemRows(page)).toHaveCount(1);
	await expect(itemRows(page)).toHaveAccessibleName("No brand × 3");
});

test("deletes the last item of a piece and the tile leaves", async ({
	page,
}) => {
	// Given: a fresh account with a Navy long button-up, no brand, 2, and a
	// White short tee, no brand, 1; the piece page of the shirt open
	await page.goto("/");
	const ids = await colourIds(page);
	await postOwnedItems(
		page,
		{ typeId: "shirt_l", colourId: ids.Navy, brandId: null, quantity: 2 },
		{ typeId: "tee_s", colourId: ids.White, brandId: null, quantity: 1 },
	);
	await page.goto(`/piece/shirt_l/${ids.Navy}`);
	// When
	await page.getByRole("button", { name: "No brand × 2" }).click();
	await editSheet(page).getByRole("button", { name: "Delete" }).click();
	await sheet(page, "Remove this item?")
		.getByRole("button", { name: "Delete" })
		.click();
	// Then
	await expect(toast(page)).toHaveText("Removed from your closet");
	await expect(page).toHaveURL("/closet");
	await expect(tiles(page)).toHaveCount(1);
	await expect(tiles(page)).toHaveAccessibleName("White short tee, 1");
});

test("shows Could not load your brands and loads them on Retry", async ({
	page,
}) => {
	// Given: a fresh account with Zara; each GET /api/brands answered 500
	// until Retry, since the closet page loads the brands too
	await page.goto("/");
	await postBrand(page, "Zara");
	let failing = true;
	await page.route("**/api/brands", (route) => {
		if (!failing || route.request().method() !== "GET") return route.continue();
		return route.fulfill({ status: 500 });
	});
	await page.goto("/closet");
	await openAddSheet(page);
	// When
	await addSheet(page).getByRole("button", { name: "No brand" }).click();
	const brandStep = sheet(page, "Pick a brand");
	await expect(brandStep.getByRole("alert")).toHaveText(
		"Could not load your brands",
	);
	failing = false;
	await brandStep.getByRole("button", { name: "Retry" }).click();
	// Then
	await expect(
		brandStep.getByRole("button", { name: "Zara", exact: true }),
	).toBeVisible();
});

test("keeps a changed quantity when an older closet load ends after the save", async ({
	page,
}) => {
	// Given: a fresh account with a Navy long button-up, no brand, 2; the
	// closet loaded; the next GET /api/owned-items, which the piece page
	// starts, answered with the list from before and held until the save ends
	await page.goto("/");
	const ids = await colourIds(page);
	await postOwnedItems(page, {
		typeId: "shirt_l",
		colourId: ids.Navy,
		brandId: null,
		quantity: 2,
	});
	await page.goto("/closet");
	await expect(tiles(page)).toHaveCount(1);
	let release = () => {};
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	let first = true;
	await page.route("**/api/owned-items", async (route) => {
		if (!first || route.request().method() !== "GET") return route.continue();
		first = false;
		const before = await route.fetch();
		await held;
		await route.fulfill({ response: before });
	});
	await tiles(page).first().click();
	// When
	await page.getByRole("button", { name: "No brand × 2" }).click();
	await editSheet(page).getByRole("button", { name: "More" }).click();
	await editSheet(page).getByRole("button", { name: "Save" }).click();
	await expect(toast(page)).toHaveText("Changes saved");
	release();
	await page.waitForLoadState("networkidle");
	// Then
	await expect(itemRows(page)).toHaveAccessibleName("No brand × 3");
});

test("saves a new pick after a save whose answer was lost", async ({
	page,
}) => {
	// Given: a fresh account on /closet; the first save reaches the server,
	// but its answer is lost
	let first = true;
	await page.route("**/api/owned-items", async (route) => {
		if (!first || route.request().method() !== "POST") return route.continue();
		first = false;
		await route.fetch();
		await route.abort();
	});
	await page.goto("/closet");
	await openAddSheet(page);
	await pickNavyShirt(page);
	await addSheet(page).getByRole("button", { name: "Save" }).click();
	await expect(addSheet(page).getByRole("alert")).toHaveText(
		"Not saved. Try again.",
	);
	// When
	await addSheet(page)
		.getByRole("radiogroup", { name: "Colour" })
		.getByRole("radio", { name: "Black", exact: true })
		.click();
	await addSheet(page).getByRole("button", { name: "Save" }).click();
	// Then
	await expect(toast(page)).toHaveText("Added to your closet");
	await expect(tiles(page)).toHaveCount(2);
});
