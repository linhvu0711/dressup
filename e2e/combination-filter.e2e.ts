import type { Page } from "@playwright/test";
import { colourIds, postCombinations, three, two } from "./combination-helpers";
import { expect, test } from "./fixtures";

const FOUR_TITLE = "White short tee + Navy chino pants";
const TWO_TITLE = "White short tee + Grey training shorts";
const THREE_TITLE =
	"Khaki Harrington jacket (open) + Black long tee + Navy casual pants";

const titles = (page: Page) => page.locator('[data-slot="combination-title"]');

const sheet = (page: Page) => page.getByRole("dialog");

const rows = (page: Page) => page.locator('[data-slot="piece-row"]');

// Copied from e2e/tags.e2e.ts, which #77 deletes.
async function postTag(page: Page, name: string) {
	const res = await page.request.post("/api/tags", { data: { name } });
	expect(res.status()).toBe(201);
	return ((await res.json()) as { tag: { id: string } }).tag.id;
}

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
			open: false,
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
	await page
		.getByRole("dialog", { name: "Edit tag" })
		.getByRole("button", { name: "Delete" })
		.click();
	await page
		.getByRole("dialog", { name: "Delete this tag?" })
		.getByRole("button", { name: "Delete" })
		.click();
	await expect(page.locator('[data-slot="toast"]')).toHaveText("Tag deleted");
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
