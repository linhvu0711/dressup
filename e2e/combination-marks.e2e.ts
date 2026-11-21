import type { Page } from "@playwright/test";
import { postOwnedItems } from "./closet-helpers";
import { postCombinations } from "./combination-helpers";
import { expect, test } from "./fixtures";
import { colourIds } from "./label-helpers";
import { sheet } from "./locators";
import { postShopLink, postWish } from "./wishlist-helpers";

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

// Khaki Harrington jacket + Grey sweater + Black long tee + Navy
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
	});
	await postOwnedItems(
		page,
		{ typeId: "tee_l", colourId: ids.Black, brandId: null, quantity: 1 },
		{ typeId: "harrington", colourId: ids.Khaki, brandId: null, quantity: 1 },
	);
	const sweaterWish = await postWish(page, {
		typeId: "sweater",
		colourId: ids.Grey,
	});
	await postWish(page, { typeId: "harrington", colourId: ids.Khaki });
	return { id, ids, sweaterWish };
}

test("marks each piece Own, Want, both, or none", async ({ page }) => {
	// Given: both projects, a fresh account with the four pieces above
	const { id } = await markedFour(page);
	// When
	await page.goto(`/combinations/${id}`);
	// Then
	await expect(lines(page)).toHaveText([
		"Khaki Harrington jacketOwnWant#B8A57C",
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
	const dialog = sheet(page, "Add to closet");
	await dialog.getByRole("button", { name: "Pick a type" }).click();
	await sheet(page, "Pick a type")
		.getByRole("button", { name: "Casual pants", exact: true })
		.click();
	await dialog
		.getByRole("radiogroup", { name: "Colour" })
		.getByRole("radio", { name: "Navy", exact: true })
		.click();
	await dialog.getByRole("button", { name: "Save" }).click();
	await expect(dialog).toBeHidden();
	await mainNav(page).getByRole("link", { name: "Combinations" }).click();
	await page.locator('[data-slot="combination-card"]').first().click();
	// Then
	await expect(line(page, "Navy casual pants")).toHaveText(
		"Navy casual pantsOwn#1F3A5F",
	);
	expect(await windowStayed(page)).toBe(true);
});

test("opens the piece page from a piece with a mark", async ({ page }) => {
	// Given: both projects, the four pieces above, the combination open
	const { id, ids } = await markedFour(page);
	await page.goto(`/combinations/${id}`);
	// When
	await line(page, "Black long tee").getByRole("link").click();
	// Then
	await expect(page).toHaveURL(`/piece/tee_l/${ids.Black}`);
});

test("makes no link of a piece with no mark", async ({ page }) => {
	// Given: both projects, the four pieces above, the combination open
	const { id } = await markedFour(page);
	await page.goto(`/combinations/${id}`);
	await expect(lines(page)).toHaveCount(4);
	// When
	const links = line(page, "Navy casual pants").getByRole("link");
	// Then
	await expect(links).toHaveCount(0);
});

test("goes back to the combination from its piece page", async ({ page }) => {
	// Given: both projects, the four pieces above, the Black long tee's piece
	// page opened from the combination
	const { id } = await markedFour(page);
	await page.goto(`/combinations/${id}`);
	await line(page, "Black long tee").getByRole("link").click();
	// The combination page has a Back of its own, to the wall.
	await expect(page).toHaveURL(/\/piece\//);
	// When
	await page.getByRole("link", { name: "Back" }).click();
	// Then
	await expect(page).toHaveURL(`/combinations/${id}`);
});

test("drops Want after the wish is removed, with no reload", async ({
	page,
}) => {
	// Given: both projects, the four pieces above, the combination open
	const { id } = await markedFour(page);
	await page.goto(`/combinations/${id}`);
	await markWindow(page);
	// When: the Grey sweater, wanted only, leaves the wishlist
	await line(page, "Grey sweater").getByRole("link").click();
	await page.getByRole("button", { name: "Remove from wishlist" }).click();
	await page
		.getByRole("alertdialog", { name: "Remove from wishlist?" })
		.getByRole("button", { name: "Remove" })
		.click();
	// Then
	await expect(page).toHaveURL(`/combinations/${id}`);
	await expect(line(page, "Grey sweater")).toHaveText("Grey sweater#8C8A84");
	expect(await windowStayed(page)).toBe(true);
});

test("shows Own and drops Want after Bought, with no reload", async ({
	page,
}) => {
	// Given: both projects, the four pieces above, the Grey sweater's wish with
	// one shop link, the combination open
	const { id, sweaterWish } = await markedFour(page);
	await postShopLink(page, sweaterWish, {
		url: "https://cos.com/sweater",
		brandId: null,
		name: "Cos sweater",
		price: null,
	});
	await page.goto(`/combinations/${id}`);
	await expect(line(page, "Grey sweater")).toHaveText(
		"Grey sweaterWant#8C8A84",
	);
	await markWindow(page);
	// When: the shop link is Bought on the sweater's piece page
	await line(page, "Grey sweater").getByRole("link").click();
	await page
		.getByRole("listitem", { name: "Cos sweater", exact: true })
		.getByRole("button", { name: "Bought" })
		.click();
	await page
		.getByRole("alertdialog", { name: "Bought this one?" })
		.getByRole("button", { name: "Bought" })
		.click();
	await expect(
		page.getByRole("heading", { name: "In your closet" }),
	).toBeVisible();
	await page.getByRole("link", { name: "Back" }).click();
	// Then
	await expect(page).toHaveURL(`/combinations/${id}`);
	await expect(line(page, "Grey sweater")).toHaveText("Grey sweaterOwn#8C8A84");
	expect(await windowStayed(page)).toBe(true);
});
