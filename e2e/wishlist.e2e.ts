import type { Page } from "@playwright/test";
import { colourIds, postBrand } from "./closet-helpers";
import { expect, test } from "./fixtures";
import { WISHLIST_FULL_FILE } from "./global-setup";
import { postShopLink, postWish } from "./wishlist-helpers";

const mainNav = (page: Page) => page.getByRole("navigation", { name: "Main" });

const tiles = (page: Page) => page.locator('[data-slot="wish-tile"]');

const addSheet = (page: Page) =>
	page.getByRole("dialog", { name: "Add to wishlist" });

// The header's "+", which comes before the empty notice's button.
const openAddSheet = (page: Page) =>
	page
		.getByRole("button", { name: "Add to wishlist", exact: true })
		.first()
		.click();

// Picks a type and a colour in the open add sheet.
async function pickPiece(page: Page, type: string, colour: string) {
	await addSheet(page).getByRole("button", { name: "Pick a type" }).click();
	await page
		.getByRole("dialog", { name: "Pick a type" })
		.getByRole("button", { name: type, exact: true })
		.click();
	await addSheet(page)
		.getByRole("radiogroup", { name: "Colour" })
		.getByRole("radio", { name: colour, exact: true })
		.click();
}

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

test("shows Nothing on your wishlist yet with a button to the form", async ({
	page,
}) => {
	// Given: a fresh account
	await page.goto("/wishlist");
	await expect(
		page.getByRole("heading", { name: "Nothing on your wishlist yet" }),
	).toBeVisible();
	await expect(page.getByText("Add the pieces you want to buy.")).toBeVisible();
	// When: the empty state's button, the second "Add to wishlist"
	await page
		.getByRole("main")
		.getByRole("button", { name: "Add to wishlist", exact: true })
		.last()
		.click();
	// Then
	await expect(addSheet(page)).toBeVisible();
});

test("keeps the form open with Not saved when the save fails", async ({
	page,
}) => {
	// Given: a fresh account; the save answers 500
	await page.route("**/api/wishes", (route) =>
		route.request().method() === "POST"
			? route.fulfill({ status: 500 })
			: route.continue(),
	);
	await page.goto("/wishlist");
	// When
	await openAddSheet(page);
	await pickPiece(page, "Long polo", "Olive");
	await addSheet(page).getByRole("button", { name: "Save" }).click();
	// Then
	await expect(addSheet(page).getByRole("alert")).toHaveText(
		"Not saved. Try again.",
	);
});

test.describe("at the wishlist limit", () => {
	test.use({ storageState: WISHLIST_FULL_FILE });

	test("turns Save off and shows the limit line at 200 wishes", async ({
		page,
	}) => {
		// Given: the account with 200 wishes
		// When
		await page.goto("/wishlist");
		await openAddSheet(page);
		// Then
		await expect(addSheet(page).getByRole("alert")).toHaveText(
			"You have 200 wishes. That is the limit. Delete one to add a new one.",
		);
		await expect(
			addSheet(page).getByRole("button", { name: "Save" }),
		).toBeDisabled();
	});
});

test("adds a wish from the form and opens its piece page", async ({ page }) => {
	// Given: a fresh account on /wishlist
	await page.goto("/");
	const ids = await colourIds(page);
	await page.goto("/wishlist");
	// When
	await openAddSheet(page);
	await pickPiece(page, "Wool jacket", "Charcoal");
	await addSheet(page).getByRole("button", { name: "Save" }).click();
	// Then
	await expect(page.locator('[data-slot="toast"]')).toHaveText(
		"Added to your wishlist",
	);
	await expect(page).toHaveURL(`/piece/wool/${ids.Charcoal}`);
	await expect(
		page.getByRole("heading", { name: "Charcoal wool jacket" }),
	).toBeVisible();
});

test("refuses a second wish for one piece and opens the first", async ({
	page,
}) => {
	// Given: a fresh account with a Charcoal wool jacket wish
	await page.goto("/");
	const ids = await colourIds(page);
	await postWish(page, { typeId: "wool", colourId: ids.Charcoal });
	await page.goto("/wishlist");
	// When
	await openAddSheet(page);
	await pickPiece(page, "Wool jacket", "Charcoal");
	await addSheet(page).getByRole("button", { name: "Save" }).click();
	// Then
	await expect(addSheet(page).getByRole("alert")).toHaveText(
		"You have this wish already.",
	);
	// When
	await addSheet(page).getByRole("link", { name: "Open it" }).click();
	// Then
	await expect(page).toHaveURL(`/piece/wool/${ids.Charcoal}`);
});

const cards = (page: Page) => page.locator('[data-slot="shop-link"]');

// A fresh account with a Charcoal wool jacket wish holding a COS link at
// 4.290.000, then a Zara link with no brand at 588.000.
async function jacketWithLinks(page: Page) {
	await page.goto("/");
	const ids = await colourIds(page);
	const cos = await postBrand(page, "COS");
	const wish = await postWish(page, { typeId: "wool", colourId: ids.Charcoal });
	await postShopLink(page, wish, {
		url: "https://www.cos.com/a",
		brandId: cos,
		name: "Single-breasted wool jacket",
		price: 4290000,
	});
	await postShopLink(page, wish, {
		url: "https://www.zara.com/b",
		brandId: null,
		name: "Wool blend jacket",
		price: 588000,
	});
	return { ids, wish };
}

const openJacket = async (page: Page) => {
	await page.goto("/wishlist");
	await page
		.getByRole("link", { name: /^Charcoal wool jacket,/ })
		.first()
		.click();
};

test("lists the shop links of a wish on its piece page", async ({ page }) => {
	// Given
	await jacketWithLinks(page);
	// When
	await openJacket(page);
	// Then
	await expect(
		page.getByRole("heading", { name: "On your wishlist" }),
	).toBeVisible();
	await expect(cards(page)).toHaveCount(2);
	expect([
		await cards(page).nth(0).locator("p, a").allInnerTexts(),
		await cards(page).nth(1).locator("p, a").allInnerTexts(),
	]).toEqual([
		["COS", "Single-breasted wool jacket", "4.290.000 ₫", "cos.com"],
		["zara.com", "Wool blend jacket", "588.000 ₫", "zara.com"],
	]);
});

test("opens the shop in a new tab with noopener noreferrer", async ({
	page,
}) => {
	// Given: the account of the case above, on the piece page
	await jacketWithLinks(page);
	await openJacket(page);
	// When
	const address = page.locator('[data-slot="shop-address"]').first();
	// Then
	await expect(address).toHaveAttribute("href", "https://www.cos.com/a");
	await expect(address).toHaveAttribute("target", "_blank");
	await expect(address).toHaveAttribute("rel", "noopener noreferrer");
});

test("shows an address that is not http as text", async ({ page }) => {
	// Given: the wishlist answers one Charcoal wool jacket wish with one link
	// whose address is a script
	await page.goto("/");
	const ids = await colourIds(page);
	await page.route("**/api/wishes", (route) =>
		route.fulfill({
			json: {
				wishes: [
					{
						id: "11111111-1111-4111-8111-111111111111",
						typeId: "wool",
						colour: { id: ids.Charcoal, name: "Charcoal", hex: "#3A3F47" },
						shopLinks: [
							{
								id: "22222222-2222-4222-8222-222222222222",
								url: "javascript:alert(1)",
								brand: null,
								name: "Odd link",
								price: null,
							},
						],
					},
				],
			},
		}),
	);
	// When
	await page.goto(`/piece/wool/${ids.Charcoal}`);
	// Then
	const card = page.getByRole("listitem", { name: "Odd link" });
	await expect(card).toContainText("javascript:alert(1)");
	await expect(card.locator("a")).toHaveCount(0);
});

test("shows the closet part and the wishlist part for a piece in both", async ({
	page,
}) => {
	// Given: a fresh account with a Charcoal wool jacket in the closet and on
	// the wishlist
	await page.goto("/");
	const ids = await colourIds(page);
	await page.request.post("/api/owned-items", {
		data: {
			id: crypto.randomUUID(),
			typeId: "wool",
			colourId: ids.Charcoal,
			brandId: null,
			quantity: 1,
		},
	});
	await postWish(page, { typeId: "wool", colourId: ids.Charcoal });
	// When
	await page.goto(`/piece/wool/${ids.Charcoal}`);
	// Then
	await expect(page.getByRole("heading", { level: 2 })).toHaveText([
		"In your closet",
		"On your wishlist",
	]);
});

test("sends a piece page with no item and no wish back to the wishlist", async ({
	page,
}) => {
	// Given: a fresh account with an Olive long polo wish, on /wishlist
	await page.goto("/");
	const ids = await colourIds(page);
	const wish = await postWish(page, { typeId: "polo_l", colourId: ids.Olive });
	await page.goto("/wishlist");
	// When: the tile; the wish deleted elsewhere; the page in view again
	await page.getByRole("link", { name: /^Olive long polo,/ }).click();
	await expect(page).toHaveURL(`/piece/polo_l/${ids.Olive}`);
	await page.request.delete(`/api/wishes/${wish}`);
	// The tab comes back into view, so the page loads its lists again.
	await page.evaluate(() =>
		document.dispatchEvent(new Event("visibilitychange")),
	);
	// Then
	await expect(page).toHaveURL("/wishlist");
});
