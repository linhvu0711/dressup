import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { jacketAndPolo, poloWithLink } from "./wishlist-helpers";

const wishCards = (page: Page) => page.locator('[data-slot="wish-card"]');

const chips = (page: Page) => page.locator('[data-slot="filter-chip"]');

const title = (page: Page) => page.getByRole("heading", { level: 1 });

test("opens a shop link's page from its card, and Back keeps the filter", async ({
	page,
}) => {
	// Given: the jacket with its two links and the polo; the Wishlist
	// filtered by COS
	const { cos, cosLink } = await jacketAndPolo(page);
	await page.goto(`/wishlist?brand=${cos}`);
	// When
	await page
		.getByRole("link", {
			name: "Single-breasted wool jacket, COS · Charcoal wool jacket",
		})
		.click();
	await expect(title(page)).toHaveText("Single-breasted wool jacket");
	const opened = {
		page: new URL(page.url()).pathname,
		title: await title(page).textContent(),
	};
	await page.getByRole("link", { name: "Back" }).click();
	await expect(wishCards(page)).toHaveCount(1);
	// Then
	expect({
		...opened,
		back: `${new URL(page.url()).pathname}${new URL(page.url()).search}`,
		chips: await chips(page).allTextContents(),
		cards: await wishCards(page).count(),
	}).toEqual({
		page: `/wishlist/link/${cosLink}`,
		title: "Single-breasted wool jacket",
		back: `/wishlist?brand=${cos}`,
		chips: ["COS"],
		cards: 1,
	});
});

test("shows a placeholder while a shop link page loads", async ({ page }) => {
	// Given: a wish with one link "Polo"; GET /api/wishes held until the
	// test lets it go
	const { link } = await poloWithLink(page);
	let release = () => {};
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	await page.route("**/api/wishes", async (route) => {
		await held;
		await route.continue();
	});
	// When
	await page.goto(`/wishlist/link/${link}`);
	await expect(page.locator('[data-slot="item-skeleton"]')).toHaveCount(1);
	const loading = await page.locator('[data-slot="item-skeleton"]').count();
	release();
	await expect(title(page)).toHaveText("Polo");
	// Then
	expect({ loading, title: await title(page).textContent() }).toEqual({
		loading: 1,
		title: "Polo",
	});
});

test("goes back to the wishlist from a shop link or a wish that is gone", async ({
	page,
}) => {
	// Given: an Olive long polo wish holding one link "Polo"; its link page
	// open; then the wish deleted elsewhere
	const { wish, link } = await poloWithLink(page);
	await page.goto(`/wishlist/link/${link}`);
	await expect(title(page)).toHaveText("Polo");
	await page.request.delete(`/api/wishes/${wish}`);
	// When: the tab comes back into view until a load sees the delete; a load
	// still running when the tab comes back is joined, not sent again
	// Then
	await expect(async () => {
		await page.evaluate(() =>
			document.dispatchEvent(new Event("visibilitychange", { bubbles: true })),
		);
		await expect(page).toHaveURL("/wishlist", { timeout: 1000 });
	}).toPass();
});
