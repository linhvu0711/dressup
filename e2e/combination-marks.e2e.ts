import type { Page } from "@playwright/test";
import { postOwnedItems } from "./closet-helpers";
import { colourIds, postCombinations } from "./combination-helpers";
import { expect, test } from "./fixtures";
import { postWish } from "./wishlist-helpers";

const lines = (page: Page) => page.locator('[data-slot="piece-line"]');

const line = (page: Page, name: string) =>
	lines(page).filter({ hasText: name });

const mainNav = (page: Page) => page.getByRole("navigation", { name: "Main" });

// A marker on the page's window: a reload loses it.
const markWindow = (page: Page) =>
	page.evaluate(() => {
		(window as unknown as { stay?: boolean }).stay = true;
	});

const windowStayed = (page: Page) =>
	page.evaluate(() => (window as unknown as { stay?: boolean }).stay === true);

// Khaki Harrington jacket (open) + Grey sweater + Black long tee + Navy
// casual pants. The closet has the jacket and the tee; the wishlist has the
// jacket and the sweater. So the jacket shows both marks, the sweater Want,
// the tee Own, and the pants none.
async function markedFour(page: Page) {
	await page.goto("/");
	const ids = await colourIds(page);
	const id = crypto.randomUUID();
	await postCombinations(page, {
		id,
		pieces: [
			{ typeId: "harrington", colourId: ids.Khaki },
			{ typeId: "sweater", colourId: ids.Grey },
			{ typeId: "tee_l", colourId: ids.Black },
			{ typeId: "casual_p", colourId: ids.Navy },
		],
		open: true,
	});
	await postOwnedItems(
		page,
		{ typeId: "tee_l", colourId: ids.Black, brandId: null, quantity: 1 },
		{ typeId: "harrington", colourId: ids.Khaki, brandId: null, quantity: 1 },
	);
	await postWish(page, { typeId: "sweater", colourId: ids.Grey });
	await postWish(page, { typeId: "harrington", colourId: ids.Khaki });
	return { id, ids };
}

test("marks each piece Own, Want, both, or none", async ({ page }) => {
	// Given: both projects, a fresh account with the four pieces above
	const { id } = await markedFour(page);
	// When
	await page.goto(`/combinations/${id}`);
	// Then
	await expect(lines(page)).toHaveText([
		"Khaki Harrington jacket · openOwnWant#B8A57C",
		"Grey sweaterWant#8C8A84",
		"Black long teeOwn#1B1B1F",
		"Navy casual pants#1F3A5F",
	]);
});

test("shows Own after an owned item is added, with no reload", async ({
	page,
}) => {
	// Given: both projects, the four pieces above, the combination open
	const { id } = await markedFour(page);
	await page.goto(`/combinations/${id}`);
	await expect(line(page, "Navy casual pants")).toHaveText(
		"Navy casual pants#1F3A5F",
	);
	await markWindow(page);
	// When: the Navy casual pants go into the closet
	await mainNav(page).getByRole("link", { name: "Closet" }).click();
	await page.getByRole("button", { name: "Add to closet" }).click();
	const sheet = page.getByRole("dialog", { name: "Add to closet" });
	await sheet.getByRole("button", { name: "Pick a type" }).click();
	await page
		.getByRole("dialog", { name: "Pick a type" })
		.getByRole("button", { name: "Casual pants", exact: true })
		.click();
	await sheet
		.getByRole("radiogroup", { name: "Colour" })
		.getByRole("radio", { name: "Navy", exact: true })
		.click();
	await sheet.getByRole("button", { name: "Save" }).click();
	await expect(sheet).toBeHidden();
	await mainNav(page).getByRole("link", { name: "Combinations" }).click();
	await page.locator('[data-slot="combination-card"]').first().click();
	// Then
	await expect(line(page, "Navy casual pants")).toHaveText(
		"Navy casual pantsOwn#1F3A5F",
	);
	expect(await windowStayed(page)).toBe(true);
});
