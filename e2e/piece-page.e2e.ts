import type { Page } from "@playwright/test";
import { postOwnedItems } from "./closet-helpers";
import { markedFour } from "./combination-helpers";
import { expect, test } from "./fixtures";
import { colourIds } from "./label-helpers";
import { sheet, toast } from "./locators";
import { postShopLink, postWish } from "./wishlist-helpers";

const line = (page: Page, name: string) =>
	page.locator('[data-slot="piece-line"]').filter({ hasText: name });

const group = (page: Page, name: string) =>
	page.getByRole("region", { name, exact: true });

test("shows a card for each owned item of the piece", async ({ page }) => {
	// Given: both projects, two Navy long button-ups, one named, and a White
	// short tee
	await page.goto("/");
	const ids = await colourIds(page);
	await postOwnedItems(
		page,
		{
			typeId: "shirt_l",
			colourId: ids.Navy,
			brandId: null,
			quantity: 1,
			name: "Oxford shirt",
		},
		{ typeId: "shirt_l", colourId: ids.Navy, brandId: null, quantity: 2 },
		{ typeId: "tee_s", colourId: ids.White, brandId: null, quantity: 1 },
	);
	// When
	await page.goto(`/piece/shirt_l/${ids.Navy}`);
	// Then
	const cards = group(page, "In your closet").locator(
		'[data-slot="closet-card"]',
	);
	await expect(cards).toHaveCount(2);
	expect(
		await cards.evaluateAll((all) =>
			all.map((card) => card.getAttribute("aria-label")),
		),
	).toEqual([
		"Navy long button-up, Navy long button-up, ×2",
		"Oxford shirt, Navy long button-up",
	]);
});

test("goes back to the piece page from an owned item's page", async ({
	page,
}) => {
	// Given: both projects, the four pieces of markedFour, the Black long tee
	// owned, the combination open
	const { id, ids } = await markedFour(page);
	await page.goto(`/combinations/${id}`);
	// When
	await line(page, "Black long tee").getByRole("link").click();
	await group(page, "In your closet")
		.locator('[data-slot="closet-card"]')
		.click();
	await expect(page).toHaveURL(/\/closet\/[^/]+$/);
	await page.getByRole("link", { name: "Back" }).click();
	// Then
	await expect(page).toHaveURL(`/piece/tee_l/${ids.Black}`);
});

test("keeps the combination as the piece page's Back after an Item page", async ({
	page,
}) => {
	// Given: both projects, as the test above, after its Back
	const { id, ids } = await markedFour(page);
	await page.goto(`/combinations/${id}`);
	await line(page, "Black long tee").getByRole("link").click();
	await group(page, "In your closet")
		.locator('[data-slot="closet-card"]')
		.click();
	await expect(page).toHaveURL(/\/closet\/[^/]+$/);
	await page.getByRole("link", { name: "Back" }).click();
	// The Item page's heading is "Black long tee" too, so the address says
	// the piece page is open.
	await expect(page).toHaveURL(`/piece/tee_l/${ids.Black}`);
	// When
	await page.getByRole("link", { name: "Back" }).click();
	// Then
	await expect(page).toHaveURL(`/combinations/${id}`);
});

test("shows a card for each shop link of the piece", async ({ page }) => {
	// Given: both projects, a Charcoal wool jacket wish with two links, no
	// brand and no price
	await page.goto("/");
	const ids = await colourIds(page);
	const wish = await postWish(page, { typeId: "wool", colourId: ids.Charcoal });
	await postShopLink(page, wish, {
		url: "https://www.cos.com/jacket",
		brandId: null,
		name: "Wool jacket",
		price: null,
	});
	await postShopLink(page, wish, {
		url: "https://www.zara.com/x",
		brandId: null,
		name: "Wool blend jacket",
		price: null,
	});
	// When
	await page.goto(`/piece/wool/${ids.Charcoal}`);
	// Then
	const cards = group(page, "On your wishlist").locator(
		'[data-slot="wish-card"]',
	);
	await expect(cards).toHaveCount(2);
	expect(
		await cards.evaluateAll((all) =>
			all.map((card) => card.getAttribute("aria-label")),
		),
	).toEqual([
		"Wool jacket, cos.com · Charcoal wool jacket",
		"Wool blend jacket, zara.com · Charcoal wool jacket",
	]);
});

test("shows the no-link card for a wish with no shop link", async ({
	page,
}) => {
	// Given: both projects, a Grey sweater wish with no link
	await page.goto("/");
	const ids = await colourIds(page);
	await postWish(page, { typeId: "sweater", colourId: ids.Grey });
	// When
	await page.goto(`/piece/sweater/${ids.Grey}`);
	// Then
	await expect(
		group(page, "On your wishlist").locator('[data-slot="wish-card"]'),
	).toHaveAccessibleName("Grey sweater, No shop link yet");
});

test("hides On your wishlist for a piece only in the closet", async ({
	page,
}) => {
	// Given: both projects, Olive chino shorts owned and no wish
	await page.goto("/");
	const ids = await colourIds(page);
	await postOwnedItems(page, {
		typeId: "chino_sh",
		colourId: ids.Olive,
		brandId: null,
		quantity: 1,
	});
	// When
	await page.goto(`/piece/chino_sh/${ids.Olive}`);
	await expect(
		page.getByRole("heading", { name: "In your closet" }),
	).toBeVisible();
	// Then
	await expect(
		page.getByRole("heading", { name: "On your wishlist" }),
	).toHaveCount(0);
});

test("goes back to the piece page from a shop link's page", async ({
	page,
}) => {
	// Given: both projects, the four pieces of markedFour, a link "Cos sweater"
	// on the Grey sweater wish, the combination open
	const { id, ids, sweaterWish } = await markedFour(page);
	await postShopLink(page, sweaterWish, {
		url: "https://cos.com/sweater",
		brandId: null,
		name: "Cos sweater",
		price: null,
	});
	await page.goto(`/combinations/${id}`);
	// When
	await line(page, "Grey sweater").getByRole("link").click();
	await group(page, "On your wishlist")
		.getByRole("link", { name: /^Cos sweater, / })
		.click();
	await expect(
		page.getByRole("heading", { level: 1, name: "Cos sweater" }),
	).toBeVisible();
	await page.getByRole("link", { name: "Back" }).click();
	// Then
	await expect(page).toHaveURL(`/piece/sweater/${ids.Grey}`);
});

test("says Not in your closet or on your wishlist after the last wish goes", async ({
	page,
}) => {
	// Given: both projects, the four pieces of markedFour, the combination open
	const { id, ids } = await markedFour(page);
	await page.goto(`/combinations/${id}`);
	// When
	await line(page, "Grey sweater").getByRole("link").click();
	await page
		.getByRole("link", { name: "Grey sweater, No shop link yet" })
		.click();
	await page.getByRole("button", { name: "Remove from wishlist" }).click();
	await page
		.getByRole("alertdialog", { name: "Remove from wishlist?" })
		.getByRole("button", { name: "Remove" })
		.click();
	// Then
	await expect(page).toHaveURL(`/piece/sweater/${ids.Grey}`);
	await expect(
		page.getByText("Not in your closet or on your wishlist."),
	).toBeVisible();
});

// A fresh account with a Navy long button-up owned.
async function navyShirt(page: Page) {
	await page.goto("/");
	const ids = await colourIds(page);
	await postOwnedItems(page, {
		typeId: "shirt_l",
		colourId: ids.Navy,
		brandId: null,
		quantity: 1,
	});
	return ids;
}

test("goes back to the closet from a piece of a colour the account does not have", async ({
	page,
}) => {
	// Given: both projects, a Navy long button-up owned
	await navyShirt(page);
	// When
	await page.goto("/piece/shirt_l/00000000-0000-4000-8000-000000000000");
	// Then
	await expect(page).toHaveURL("/closet");
});

test("goes back to the closet from a piece of a type that does not exist", async ({
	page,
}) => {
	// Given: both projects, as the test above
	const ids = await navyShirt(page);
	// When
	await page.goto(`/piece/cape/${ids.Navy}`);
	// Then
	await expect(page).toHaveURL("/closet");
});

test("shows Could not load your colours and loads them on Retry", async ({
	page,
}) => {
	// Given: both projects, a fresh account with no item and no wish; each GET
	// /api/colours answered 500 until Retry
	await page.goto("/");
	const ids = await colourIds(page);
	let failing = true;
	await page.route("**/api/colours", (route) => {
		if (!failing || route.request().method() !== "GET") return route.continue();
		return route.fulfill({ status: 500 });
	});
	// When
	await page.goto(`/piece/shirt_l/${ids.Navy}`);
	await expect(
		page.getByRole("heading", { name: "Could not load your colours" }),
	).toBeVisible();
	failing = false;
	await page.getByRole("button", { name: "Retry" }).click();
	// Then
	await expect(
		page.getByText("Not in your closet or on your wishlist."),
	).toBeVisible();
});

// Holds every GET of this path until the test lets it go.
async function hold(page: Page, path: string) {
	let release = () => {};
	const released = new Promise<void>((resolve) => {
		release = resolve;
	});
	await page.route(path, async (route) => {
		if (route.request().method() === "GET") await released;
		await route.continue();
	});
	return release;
}

test("shows the placeholder while the lists load", async ({ page }) => {
	// Given: both projects, a Navy long button-up owned; GET
	// /api/owned-items held
	const ids = await navyShirt(page);
	const release = await hold(page, "**/api/owned-items");
	// When
	await page.goto(`/piece/shirt_l/${ids.Navy}`);
	// Then
	await expect(page.locator('[data-slot="piece-skeleton"]')).toBeVisible();
	release();
});

test("shows the placeholder while the colours load", async ({ page }) => {
	// Given: both projects, a fresh account with no item and no wish; GET
	// /api/colours held
	await page.goto("/");
	const ids = await colourIds(page);
	const release = await hold(page, "**/api/colours");
	// When
	await page.goto(`/piece/shirt_l/${ids.Navy}`);
	// Then
	await expect(page.locator('[data-slot="piece-skeleton"]')).toBeVisible();
	await expect(page).toHaveURL(`/piece/shirt_l/${ids.Navy}`);
	release();
});

// A fresh account with a Charcoal wool jacket wish and this many shop links.
async function jacketWithLinks(page: Page, links: number) {
	await page.goto("/");
	const ids = await colourIds(page);
	const wish = await postWish(page, { typeId: "wool", colourId: ids.Charcoal });
	for (let n = 1; n <= links; n++)
		await postShopLink(page, wish, {
			url: `https://shop.example/${n}`,
			brandId: null,
			name: `Link ${n}`,
			price: null,
		});
	await page.goto(`/piece/wool/${ids.Charcoal}`);
	return ids;
}

const wishCards = (page: Page) =>
	group(page, "On your wishlist").locator('[data-slot="wish-card"]');

test("adds a shop link from the piece page", async ({ page }) => {
	// Given: both projects, a Charcoal wool jacket wish with one link, on its
	// piece page
	await jacketWithLinks(page, 1);
	await expect(wishCards(page)).toHaveCount(1);
	// When
	await group(page, "On your wishlist")
		.getByRole("button", { name: "Add a shop link" })
		.click();
	const add = sheet(page, "Add a shop link");
	await add
		.getByRole("textbox", { name: "Address" })
		.fill("https://www.zara.com/x");
	await add.getByRole("textbox", { name: "Name" }).fill("Wool blend jacket");
	await add.getByRole("button", { name: "Save" }).click();
	// Then
	await expect(toast(page)).toHaveText("Shop link added");
	await expect(wishCards(page)).toHaveCount(2);
	await expect(wishCards(page).nth(1)).toHaveAccessibleName(
		"Wool blend jacket, zara.com · Charcoal wool jacket",
	);
});

test("removes a wish with its shop links from the piece page", async ({
	page,
}) => {
	// Given: both projects, a Charcoal wool jacket wish with two links, on its
	// piece page
	await jacketWithLinks(page, 2);
	// When
	await group(page, "On your wishlist")
		.getByRole("button", { name: "Remove from wishlist" })
		.click();
	const confirm = page.getByRole("alertdialog", {
		name: "Remove from wishlist?",
	});
	await expect(confirm).toContainText("Its 2 shop links go with it.");
	await confirm.getByRole("button", { name: "Remove" }).click();
	// Then
	await expect(
		page.getByText("Not in your closet or on your wishlist."),
	).toBeVisible();
	await expect(wishCards(page)).toHaveCount(0);
});

test("turns off Add a shop link at 10 links and says the limit", async ({
	page,
}) => {
	// Given: both projects, a Charcoal wool jacket wish with 10 links
	await jacketWithLinks(page, 10);
	// Then
	const wished = group(page, "On your wishlist");
	await expect(
		wished.getByRole("button", { name: "Add a shop link" }),
	).toBeDisabled();
	await expect(
		wished.getByText("10 shop links is the limit for one wish."),
	).toBeVisible();
});
