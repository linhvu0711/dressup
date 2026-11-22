import type { Page } from "@playwright/test";
import { postOwnedItems } from "./closet-helpers";
import { markedFour } from "./combination-helpers";
import { expect, test } from "./fixtures";
import { colourIds } from "./label-helpers";

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
	const { id } = await markedFour(page);
	await page.goto(`/combinations/${id}`);
	await line(page, "Black long tee").getByRole("link").click();
	await group(page, "In your closet")
		.locator('[data-slot="closet-card"]')
		.click();
	await expect(page).toHaveURL(/\/closet\/[^/]+$/);
	await page.getByRole("link", { name: "Back" }).click();
	await expect(
		page.getByRole("heading", { level: 1, name: "Black long tee" }),
	).toBeVisible();
	// When
	await page.getByRole("link", { name: "Back" }).click();
	// Then
	await expect(page).toHaveURL(`/combinations/${id}`);
});
