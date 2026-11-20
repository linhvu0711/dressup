import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { WISHLIST_FULL_FILE } from "./global-setup";
import { colourIds, postBrand } from "./label-helpers";
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
	const openWall = async (page: Page) => {
		await page.goto("/wishlist");
		await expect(tiles(page).first().locator("svg")).toHaveCount(1);
	};

	test("draws only the tiles near the screen", async ({ page }) => {
		// Given: both projects, the account with 200 wishes
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
		// Given: both projects, the account with 200 wishes, the wall open with the first tile
		// drawn
		await openWall(page);
		const last = page.getByRole("link", {
			name: "Burgundy chino pants, No link yet",
		});
		// When
		await last.scrollIntoViewIfNeeded();
		// Then
		await expect(last.locator("svg")).toHaveCount(1);
		await expect(tiles(page).first().locator("svg")).toHaveCount(0);
	});

	test("keeps every tile on the page", async ({ page }) => {
		// Given: both projects, the account with 200 wishes
		// When
		await openWall(page);
		// Then
		await expect(tiles(page)).toHaveCount(200);
		await expect(
			page.getByRole("link", { name: "Burgundy chino pants, No link yet" }),
		).toBeAttached();
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
								pictureIds: [],
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

// A fresh account with a Charcoal wool jacket in the closet and on the
// wishlist; returns the jacket's piece page.
async function pieceInBoth(page: Page) {
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
	return `/piece/wool/${ids.Charcoal}`;
}

test("shows the closet part and the wishlist part for a piece in both", async ({
	page,
}) => {
	// Given: the jacket in both lists
	const piece = await pieceInBoth(page);
	// When
	await page.goto(piece);
	// Then
	await expect(page.getByRole("heading", { level: 2 })).toHaveText([
		"In your closet",
		"On your wishlist",
	]);
});

// Answers the first GET of the address 500 and passes on the rest.
async function failFirstLoad(page: Page, address: string) {
	let failed = false;
	await page.route(address, (route) => {
		if (failed || route.request().method() !== "GET") return route.continue();
		failed = true;
		return route.fulfill({ status: 500 });
	});
}

test("shows the wishlist part's failed load on the piece page and loads it on Retry", async ({
	page,
}) => {
	// Given: the jacket in both lists; the first load of the wishlist fails
	const piece = await pieceInBoth(page);
	await failFirstLoad(page, "**/api/wishes");
	// When
	await page.goto(piece);
	// Then: the closet part, and the wishlist part says it failed
	await expect(page.getByRole("heading", { level: 2 })).toHaveText([
		"In your closet",
		"On your wishlist",
	]);
	await expect(page.getByRole("alert")).toHaveText(
		"Could not load your wishlist.",
	);
	// When
	await page.getByRole("button", { name: "Retry" }).click();
	// Then
	await expect(page.getByRole("alert")).toHaveCount(0);
	await expect(page.getByText("No shop link yet.")).toBeVisible();
});

test("shows Could not load your closet and wishlist when both fail on the piece page", async ({
	page,
}) => {
	// Given: the jacket in both lists; the first load of each list fails
	const piece = await pieceInBoth(page);
	await failFirstLoad(page, "**/api/owned-items");
	await failFirstLoad(page, "**/api/wishes");
	// When
	await page.goto(piece);
	// Then
	await expect(
		page.getByRole("heading", {
			name: "Could not load your closet and wishlist",
		}),
	).toBeVisible();
	// When: one Retry loads both
	await page.getByRole("button", { name: "Retry" }).click();
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
	// When: the tile; the wish deleted elsewhere
	await page.getByRole("link", { name: /^Olive long polo,/ }).click();
	await expect(page).toHaveURL(`/piece/polo_l/${ids.Olive}`);
	await page.request.delete(`/api/wishes/${wish}`);
	// Then: once the tab comes back into view, the page loads its lists again
	// and goes back. A load still running when the tab comes back is joined,
	// not sent again, so the tab comes back until a load sees the delete.
	await expect(async () => {
		await page.evaluate(() =>
			document.dispatchEvent(new Event("visibilitychange", { bubbles: true })),
		);
		await expect(page).toHaveURL("/wishlist", { timeout: 1000 });
	}).toPass();
});

const linkSheet = (page: Page, name = "Add a shop link") =>
	page.getByRole("dialog", { name });

// A fresh account with a Charcoal wool jacket wish, on its piece page.
async function onJacketPage(page: Page) {
	await page.goto("/");
	const ids = await colourIds(page);
	const wish = await postWish(page, { typeId: "wool", colourId: ids.Charcoal });
	await page.goto(`/piece/wool/${ids.Charcoal}`);
	await expect(
		page.getByRole("heading", { name: "On your wishlist" }),
	).toBeVisible();
	return { ids, wish };
}

const ZARA = "https://www.zara.com/vn/en/wool-blend-jacket.html";

test("adds a shop link from the sheet", async ({ page }) => {
	// Given
	await onJacketPage(page);
	// When
	await page.getByRole("button", { name: "Add a shop link" }).click();
	await linkSheet(page).getByRole("textbox", { name: "Address" }).fill(ZARA);
	await linkSheet(page)
		.getByRole("textbox", { name: "Name" })
		.fill("Wool blend jacket");
	await linkSheet(page)
		.getByRole("textbox", { name: "Price in ₫" })
		.pressSequentially("2990000");
	await linkSheet(page).getByRole("button", { name: "Save" }).click();
	// Then
	await expect(page.locator('[data-slot="toast"]')).toHaveText(
		"Shop link added",
	);
	expect(await cards(page).first().locator("p, a").allInnerTexts()).toEqual([
		"zara.com",
		"Wool blend jacket",
		"2.990.000 ₫",
		"zara.com",
	]);
});

test("shows dots in the price as it is typed", async ({ page }) => {
	// Given: the sheet open
	await onJacketPage(page);
	await page.getByRole("button", { name: "Add a shop link" }).click();
	// When
	const price = linkSheet(page).getByRole("textbox", { name: "Price in ₫" });
	await price.pressSequentially("2990000");
	// Then
	await expect(price).toHaveValue("2.990.000");
});

test("refuses an address without http and a link with no name", async ({
	page,
}) => {
	// Given: the sheet open, the name Shirt
	await onJacketPage(page);
	await page.getByRole("button", { name: "Add a shop link" }).click();
	const sheet = linkSheet(page);
	await sheet.getByRole("textbox", { name: "Name" }).fill("Shirt");
	// When
	await sheet.getByRole("textbox", { name: "Address" }).fill("zara.com/shirt");
	await sheet.getByRole("button", { name: "Save" }).click();
	// Then
	await expect(sheet.getByRole("alert")).toHaveText(
		"Enter a web address that starts with https://.",
	);
	// When
	await sheet
		.getByRole("textbox", { name: "Address" })
		.fill("https://zara.com/shirt");
	await sheet.getByRole("textbox", { name: "Name" }).fill("");
	await sheet.getByRole("button", { name: "Save" }).click();
	// Then
	await expect(sheet.getByRole("alert")).toHaveText("Enter a name.");
	await expect(sheet).toBeVisible();
});

// The jacket page with the Zara link at 2.990.000.
async function onJacketWithLink(page: Page) {
	await page.goto("/");
	const ids = await colourIds(page);
	const wish = await postWish(page, { typeId: "wool", colourId: ids.Charcoal });
	await postShopLink(page, wish, {
		url: ZARA,
		brandId: null,
		name: "Wool blend jacket",
		price: 2990000,
	});
	await page.goto(`/piece/wool/${ids.Charcoal}`);
}

test("changes a shop link", async ({ page }) => {
	// Given
	await onJacketWithLink(page);
	// When
	await page.getByRole("button", { name: "Change shop link" }).click();
	const sheet = linkSheet(page, "Edit shop link");
	await sheet.getByRole("textbox", { name: "Price in ₫" }).fill("2490000");
	await sheet.getByRole("button", { name: "Save" }).click();
	// Then
	await expect(page.locator('[data-slot="toast"]')).toHaveText("Changes saved");
	await expect(cards(page).first()).toContainText("2.490.000 ₫");
});

test("deletes a shop link after its confirm", async ({ page }) => {
	// Given
	await onJacketWithLink(page);
	// When
	await page.getByRole("button", { name: "Change shop link" }).click();
	await linkSheet(page, "Edit shop link")
		.getByRole("button", { name: "Delete" })
		.click();
	const confirm = linkSheet(page, "Delete this shop link?");
	// Then
	await expect(confirm).toBeVisible();
	// When
	await confirm.getByRole("button", { name: "Delete" }).click();
	// Then
	await expect(page.locator('[data-slot="toast"]')).toHaveText(
		"Shop link deleted",
	);
	await expect(page.getByText("No shop link yet.")).toBeVisible();
});

test("turns Add a shop link off at 10 links", async ({ page }) => {
	// Given: a fresh account with a wish holding 10 links
	await page.goto("/");
	const ids = await colourIds(page);
	const wish = await postWish(page, { typeId: "wool", colourId: ids.Charcoal });
	for (let i = 1; i <= 10; i++)
		await postShopLink(page, wish, {
			url: `https://shop.example/${i}`,
			brandId: null,
			name: `Link ${i}`,
			price: null,
		});
	// When
	await page.goto(`/piece/wool/${ids.Charcoal}`);
	// Then
	await expect(
		page.getByRole("button", { name: "Add a shop link" }),
	).toBeDisabled();
	await expect(
		page.getByText("10 shop links is the limit for one wish."),
	).toBeVisible();
});

test("keeps the shop link sheet open with Not saved when the save fails", async ({
	page,
}) => {
	// Given: the save answers 500
	await page.route("**/api/wishes/*/shop-links", (route) =>
		route.fulfill({ status: 500 }),
	);
	await onJacketPage(page);
	// When
	await page.getByRole("button", { name: "Add a shop link" }).click();
	await linkSheet(page).getByRole("textbox", { name: "Address" }).fill(ZARA);
	await linkSheet(page)
		.getByRole("textbox", { name: "Name" })
		.fill("Wool blend jacket");
	await linkSheet(page).getByRole("button", { name: "Save" }).click();
	// Then
	await expect(linkSheet(page).getByRole("alert")).toHaveText(
		"Not saved. Try again.",
	);
});

test("removes a wish after a confirm that counts its links", async ({
	page,
}) => {
	// Given: a fresh account with a Charcoal wool jacket in the closet and on
	// the wishlist with 2 links, on its piece page
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
	const wish = await postWish(page, { typeId: "wool", colourId: ids.Charcoal });
	for (const n of [1, 2])
		await postShopLink(page, wish, {
			url: `https://shop.example/${n}`,
			brandId: null,
			name: `Link ${n}`,
			price: null,
		});
	await page.goto(`/piece/wool/${ids.Charcoal}`);
	// When
	await page.getByRole("button", { name: "Remove from wishlist" }).click();
	const confirm = page.getByRole("alertdialog", {
		name: "Remove from wishlist?",
	});
	// Then
	await expect(confirm).toContainText("Its 2 shop links go with it.");
	// When
	await confirm.getByRole("button", { name: "Remove" }).click();
	// Then
	await expect(page.locator('[data-slot="toast"]')).toHaveText(
		"Removed from your wishlist",
	);
	await expect(page.getByRole("heading", { level: 2 })).toHaveText([
		"In your closet",
	]);
});
