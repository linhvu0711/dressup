import type { Page } from "@playwright/test";
import { postOwnedItems } from "./closet-helpers";
import { isPhone, postCombinations, three, two } from "./combination-helpers";
import { expect, test } from "./fixtures";
import { colourIds, postTag } from "./label-helpers";
import { sheet, toast } from "./locators";

const FOUR_TITLE = "White short tee + Navy chino pants";
const TWO_TITLE = "White short tee + Grey training shorts";
const THREE_TITLE =
	"Khaki Harrington jacket + Black long tee + Navy casual pants";

const titles = (page: Page) => page.locator('[data-slot="combination-title"]');

const rows = (page: Page) => page.locator('[data-slot="piece-row"]');

// TWO, THREE with work, and FOUR (White short tee + Navy chino pants) with
// work and weekend, saved in that order, so the wall shows FOUR, THREE, TWO.
async function seedWall(page: Page) {
	await page.goto("/");
	const work = await postTag(page, "work");
	const weekend = await postTag(page, "weekend");
	const ids = await colourIds(page);
	await postCombinations(
		page,
		two(ids),
		{ ...three(ids), tags: [work] },
		{
			id: crypto.randomUUID(),
			pieces: [
				{ typeId: "chino_p", colourId: ids.Navy },
				{ typeId: "tee_s", colourId: ids.White },
			],
			tags: [work, weekend],
		},
	);
	return { work, weekend };
}

async function openWall(page: Page, search = "") {
	await page.goto(`/combinations${search}`);
	await expect(titles(page).first()).toBeVisible();
}

async function openFilter(page: Page) {
	await page.getByRole("button", { name: "Filter", exact: true }).click();
	await expect(sheet(page)).toBeVisible();
}

test("filters the wall by one piece row at once", async ({ page }) => {
	// Given: both projects, a fresh account; the wall of FOUR, THREE, TWO
	await seedWall(page);
	await openWall(page);
	// When
	await openFilter(page);
	await sheet(page).getByRole("button", { name: "Any type" }).click();
	await sheet(page)
		.getByRole("button", { name: "Short tee", exact: true })
		.click();
	// Then: the sheet is still open
	await expect(sheet(page)).toBeVisible();
	await expect(titles(page)).toHaveText([FOUR_TITLE, TWO_TITLE]);
});

test("swaps the sheet to the type list and the colour list, with Back", async ({
	page,
}) => {
	// Given: both projects, a fresh account; the wall, the Filter sheet open
	await seedWall(page);
	await openWall(page);
	await openFilter(page);
	// When
	await sheet(page).getByRole("button", { name: "Any type" }).click();
	// Then
	await expect(sheet(page)).toHaveCount(1);
	await expect(sheet(page).getByRole("heading")).toHaveText("Type");
	await expect(sheet(page).getByRole("button", { name: "Back" })).toBeVisible();
	// When
	await sheet(page).getByRole("button", { name: "Back" }).click();
	// Then
	await expect(sheet(page)).toHaveCount(1);
	await expect(sheet(page).getByRole("heading")).toHaveText("Filter");
	// When
	await sheet(page).getByRole("button", { name: "Any colour" }).click();
	// Then
	await expect(sheet(page)).toHaveCount(1);
	await expect(sheet(page).getByRole("heading")).toHaveText("Colour");
	await expect(
		sheet(page).getByRole("button", { name: "Any colour" }),
	).toBeVisible();
	await expect(sheet(page).getByRole("radio", { name: "Navy" })).toBeVisible();
});

test("adds and removes piece rows, and an empty row filters nothing", async ({
	page,
}) => {
	// Given: both projects, a fresh account; the wall, the Filter sheet open
	await seedWall(page);
	await openWall(page);
	await openFilter(page);
	// When
	await sheet(page).getByRole("button", { name: "+ Another piece" }).click();
	// Then
	await expect(rows(page)).toHaveCount(2);
	await expect(titles(page)).toHaveCount(3);
	// When
	await sheet(page)
		.getByRole("button", { name: "Remove piece" })
		.nth(1)
		.click();
	// Then
	await expect(rows(page)).toHaveCount(1);
	await expect(titles(page)).toHaveCount(3);
});

test("shows only the combinations that match every row", async ({ page }) => {
	// Given: both projects, a fresh account; the wall, the Filter sheet open
	await seedWall(page);
	await openWall(page);
	await openFilter(page);
	// When: row 1 Short tee in White, row 2 any Navy piece
	await rows(page).nth(0).getByRole("button", { name: "Any type" }).click();
	await sheet(page)
		.getByRole("button", { name: "Short tee", exact: true })
		.click();
	await rows(page).nth(0).getByRole("button", { name: "Any colour" }).click();
	await sheet(page).getByRole("radio", { name: "White" }).click();
	await sheet(page).getByRole("button", { name: "+ Another piece" }).click();
	await rows(page).nth(1).getByRole("button", { name: "Any colour" }).click();
	await sheet(page).getByRole("radio", { name: "Navy" }).click();
	await sheet(page).getByRole("button", { name: "Show 1 combination" }).click();
	// Then
	await expect(sheet(page)).toHaveCount(0);
	await expect(titles(page)).toHaveText([FOUR_TITLE]);
});

test("shows the Filter button left of + at 36 px with a count badge", async ({
	page,
}) => {
	// Given: both projects, a fresh account; the wall
	await seedWall(page);
	await openWall(page);
	const filter = page.getByRole("button", { name: "Filter", exact: true });
	const plus = page.getByRole("link", { name: "New combination" });
	const badge = page.locator('[data-slot="filter-count"]');
	// When
	const filterBox = await filter.boundingBox();
	const plusBox = await plus.boundingBox();
	// Then
	expect({
		filter: [filterBox?.width, filterBox?.height],
		plus: [plusBox?.width, plusBox?.height],
		leftOfPlus:
			(filterBox?.x ?? 0) + (filterBox?.width ?? 0) <= (plusBox?.x ?? 0),
	}).toEqual({ filter: [36, 36], plus: [36, 36], leftOfPlus: true });
	await expect(badge).toHaveCount(0);
	// When
	await openFilter(page);
	await sheet(page).getByRole("button", { name: "Any type" }).click();
	await sheet(page)
		.getByRole("button", { name: "Sweater", exact: true })
		.click();
	await sheet(page)
		.getByRole("button", { name: "Show 0 combinations" })
		.click();
	// Then
	await expect(badge).toHaveText("1");
});

test("filters the wall by a tag", async ({ page }) => {
	// Given: both projects, a fresh account; the wall, the Filter sheet open
	await seedWall(page);
	await openWall(page);
	await openFilter(page);
	// When
	await sheet(page).getByRole("button", { name: "work", exact: true }).click();
	// Then
	await expect(titles(page)).toHaveText([FOUR_TITLE, THREE_TITLE]);
	// When
	await sheet(page)
		.getByRole("button", { name: "weekend", exact: true })
		.click();
	// Then
	await expect(titles(page)).toHaveText([FOUR_TITLE]);
});

test("removes a filter by its chip and every filter by Clear all", async ({
	page,
}) => {
	// Given: both projects, a fresh account; the wall filtered by Short tee
	// and work
	const { work } = await seedWall(page);
	await openWall(page, `?piece=tee_s.&tag=${work}`);
	const chips = page.locator('[data-slot="filter-chip"]');
	const active = page.getByRole("group", { name: "Active filters" });
	const badge = page.locator('[data-slot="filter-count"]');
	const line = page.locator('[data-slot="filter-shown"]');
	// Then
	await expect(chips).toHaveText(["Short tee", "work"]);
	await expect(active.getByRole("button").last()).toHaveText("Clear all");
	await expect(badge).toHaveText("2");
	await expect(line).toHaveText("1 combination");
	// When
	await page.getByRole("button", { name: "Remove work" }).click();
	// Then
	await expect(chips).toHaveText(["Short tee"]);
	await expect(badge).toHaveText("1");
	await expect(titles(page)).toHaveCount(2);
	// When
	await active.getByRole("button", { name: "Clear all" }).click();
	// Then
	await expect(active).toHaveCount(0);
	await expect(badge).toHaveCount(0);
	await expect(titles(page)).toHaveCount(3);
	expect(new URL(page.url()).search).toBe("");
});

test("shows No combinations here and clears all from it", async ({ page }) => {
	// Given: both projects, a fresh account; the wall filtered by Sweater
	await seedWall(page);
	await page.goto("/combinations?piece=sweater.");
	const notice = page.getByRole("heading", { name: "No combinations here" });
	// Then
	await expect(notice).toBeVisible();
	await expect(
		page.getByText("No combination matches all of your filters."),
	).toBeVisible();
	await expect(titles(page)).toHaveCount(0);
	// When
	await page
		.locator("main")
		.getByRole("button", { name: "Clear all" })
		.last()
		.click();
	// Then
	await expect(titles(page)).toHaveCount(3);
	await expect(page.getByRole("group", { name: "Active filters" })).toHaveCount(
		0,
	);
});

test("drops a deleted tag from the filter", async ({ page }) => {
	// Given: both projects, a fresh account; the wall filtered by Short tee
	// and weekend, showing FOUR
	const { weekend } = await seedWall(page);
	await openWall(page, `?piece=tee_s.&tag=${weekend}`);
	await expect(titles(page)).toHaveText([FOUR_TITLE]);
	// When: weekend is deleted on the Labels page, then Back
	await page
		.getByRole("navigation", { name: "Main" })
		.getByRole("link", { name: "Labels" })
		.click();
	await page.getByRole("tab", { name: "Tags" }).click();
	await page
		.locator('[data-slot="tag-list"]')
		.getByRole("button")
		.filter({ hasText: "weekend" })
		.click();
	await sheet(page, "Edit tag").getByRole("button", { name: "Delete" }).click();
	await sheet(page, "Delete this tag?")
		.getByRole("button", { name: "Delete" })
		.click();
	await expect(toast(page)).toHaveText("Tag deleted");
	await page.goBack();
	// Then
	await expect(page.locator('[data-slot="filter-chip"]')).toHaveText([
		"Short tee",
	]);
	await expect(titles(page)).toHaveText([FOUR_TITLE, TWO_TITLE]);
});

test("keeps the filter when a combination opens, on Back, and after the builder", async ({
	page,
}) => {
	// Given: both projects, a fresh account; the wall filtered by Short tee
	await seedWall(page);
	await openWall(page, "?piece=tee_s.");
	const chips = page.locator('[data-slot="filter-chip"]');
	const isPhone = (page.viewportSize()?.width ?? 0) < 900;
	// When
	await page
		.locator('[data-slot="combination-card"]')
		.filter({ hasText: FOUR_TITLE })
		.click();
	// Then
	await expect(page).toHaveURL(/\/combinations\/[0-9a-f-]+\?piece=tee_s\.$/);
	// When
	if (isPhone) await page.getByRole("link", { name: "Back" }).click();
	// Then
	await expect(chips).toHaveText(["Short tee"]);
	await expect(titles(page)).toHaveCount(2);
	// When
	await page.getByRole("link", { name: "New combination" }).click();
	await page.getByRole("link", { name: "Close", exact: true }).click();
	// Then
	await expect(chips).toHaveText(["Short tee"]);
	await expect(titles(page)).toHaveCount(2);
	// When
	await page.reload();
	// Then
	await expect(chips).toHaveText(["Short tee"]);
	await expect(titles(page)).toHaveCount(2);
});

test("drops the filter from the address of an empty wall", async ({ page }) => {
	// Given: both projects, a fresh account with no combination
	// When
	await page.goto("/combinations?piece=tee_s.");
	// Then
	await expect(
		page.getByRole("heading", { name: "No combinations yet" }),
	).toBeVisible();
	await expect(page).toHaveURL(/\/combinations$/);
	await expect(
		page.getByRole("link", { name: "Build a combination" }),
	).toHaveAttribute("href", "/build");
});

// THREE and TWO, with both pieces of TWO in the closet: TWO is the one
// combination whose pieces the closet holds all of.
async function seedOwned(page: Page) {
	await page.goto("/");
	const ids = await colourIds(page);
	await postCombinations(page, three(ids), two(ids));
	await postOwnedItems(
		page,
		{ typeId: "train_sh", colourId: ids.Grey, brandId: null, quantity: 1 },
		{ typeId: "tee_s", colourId: ids.White, brandId: null, quantity: 1 },
	);
}

const ownChoice = (page: Page, name: string) =>
	sheet(page)
		.getByRole("radiogroup", { name: "Pieces I own" })
		.getByRole("radio", { name, exact: true });

test("shows only the combinations whose pieces I own all of", async ({
	page,
}) => {
	// Given: both projects, a fresh account with THREE and TWO, TWO owned
	await seedOwned(page);
	await openWall(page);
	// When
	await openFilter(page);
	await ownChoice(page, "All of them").click();
	await page.getByRole("button", { name: "Show 1 combination" }).click();
	// Then
	await expect(titles(page)).toHaveText([TWO_TITLE]);
});

test("shows the combinations with a piece I do not own", async ({ page }) => {
	// Given: both projects, a fresh account with THREE and TWO, TWO owned
	await seedOwned(page);
	await openWall(page);
	// When
	await openFilter(page);
	await ownChoice(page, "Not all").click();
	await page.getByRole("button", { name: "Show 1 combination" }).click();
	// Then
	await expect(titles(page)).toHaveText([THREE_TITLE]);
});

test("shows Own all pieces as a chip", async ({ page }) => {
	// Given: both projects, a fresh account with THREE and TWO, TWO owned
	await seedOwned(page);
	// When
	await openWall(page, "?own=all");
	// Then
	await expect(
		page.getByRole("button", { name: "Remove Own all pieces" }),
	).toBeVisible();
});

test("puts Any back with Clear all", async ({ page }) => {
	// Given: both projects, a fresh account with THREE and TWO, TWO owned;
	// the wall at All of them
	await seedOwned(page);
	await openWall(page, "?own=all");
	await expect(titles(page)).toHaveText([TWO_TITLE]);
	// When
	await page
		.getByRole("group", { name: "Active filters" })
		.getByRole("button", { name: "Clear all" })
		.click();
	// Then
	await expect(page).toHaveURL("/combinations");
});

test("keeps a combination only when it passes the piece rows, Pieces I own, and the tags", async ({
	page,
}) => {
	// Given: both projects, a fresh account. P passes all three; Q has no
	// White short tee; R has no work tag; S has Navy casual pants, which the
	// closet lacks
	await page.goto("/");
	const work = await postTag(page, "work");
	const ids = await colourIds(page);
	const combination = (pieces: [string, string][], tags: string[]) => ({
		id: crypto.randomUUID(),
		pieces: pieces.map(([typeId, colourId]) => ({ typeId, colourId })),
		tags,
	});
	await postCombinations(
		page,
		combination(
			[
				["tee_s", ids.White],
				["chino_p", ids.Navy],
			],
			[work],
		),
		combination(
			[
				["tee_l", ids.Black],
				["chino_p", ids.Navy],
			],
			[work],
		),
		combination(
			[
				["tee_s", ids.White],
				["train_sh", ids.Grey],
			],
			[],
		),
		combination(
			[
				["tee_s", ids.White],
				["casual_p", ids.Navy],
			],
			[work],
		),
	);
	await postOwnedItems(
		page,
		{ typeId: "tee_s", colourId: ids.White, brandId: null, quantity: 1 },
		{ typeId: "chino_p", colourId: ids.Navy, brandId: null, quantity: 1 },
		{ typeId: "tee_l", colourId: ids.Black, brandId: null, quantity: 1 },
		{ typeId: "train_sh", colourId: ids.Grey, brandId: null, quantity: 1 },
	);
	// When
	await openWall(page, `?piece=tee_s.${ids.White}&tag=${work}&own=all`);
	// Then
	await expect(titles(page)).toHaveText([FOUR_TITLE]);
});

test("says Could not load your closet when Pieces I own has no closet", async ({
	page,
}) => {
	// Given: both projects, a fresh account with THREE and TWO, TWO owned;
	// the closet answers 500
	await seedOwned(page);
	await page.route("**/api/owned-items", (route) =>
		route.fulfill({ status: 500 }),
	);
	// When
	await page.goto("/combinations?own=all");
	// Then
	await expect(page.getByText("Could not load your closet")).toBeVisible();
});

test("counts no combination for Pieces I own until the closet is in", async ({
	page,
}) => {
	// Given: both projects, a fresh account with THREE and TWO, TWO owned;
	// the closet answers only when let go
	await seedOwned(page);
	let letGo = () => {};
	const held = new Promise<void>((resolve) => {
		letGo = resolve;
	});
	await page.route("**/api/owned-items", async (route) => {
		await held;
		await route.continue();
	});
	await page.goto("/combinations?own=all");
	await expect(
		page.locator('[data-slot="combination-skeleton"]').first(),
	).toBeVisible();
	await expect(page.locator('[data-slot="filter-shown"]')).toHaveCount(0);
	// When
	letGo();
	// Then
	await expect(page.locator('[data-slot="filter-shown"]')).toHaveText(
		"1 combination",
	);
	await expect(titles(page)).toHaveText([TWO_TITLE]);
});

test("closes the open combination that All of them hides once the closet is in", async ({
	page,
}) => {
	test.skip(
		isPhone(page),
		"laptop layout only: the combination opens beside the wall",
	);
	// Given: laptop, a fresh account with THREE and TWO, TWO owned; THREE open
	// beside the wall; the closet answers only when let go
	await seedOwned(page);
	let letGo = () => {};
	const held = new Promise<void>((resolve) => {
		letGo = resolve;
	});
	await page.route("**/api/owned-items", async (route) => {
		await held;
		await route.continue();
	});
	await openWall(page);
	await page
		.locator('[data-slot="combination-card"]')
		.filter({ hasText: THREE_TITLE })
		.click();
	await expect(page).toHaveURL(/\/combinations\/[0-9a-f-]+$/);
	// When
	await openFilter(page);
	await ownChoice(page, "All of them").click();
	letGo();
	// Then
	await expect(page).toHaveURL("/combinations?own=all");
	await expect(page.locator('[data-slot="combination-view"]')).toHaveCount(0);
});
