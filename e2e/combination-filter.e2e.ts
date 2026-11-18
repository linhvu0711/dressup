import type { Page } from "@playwright/test";
import { colourIds, postCombinations, three, two } from "./combination-helpers";
import { expect, test } from "./fixtures";

const FOUR_TITLE = "White short tee + Navy chino pants";
const TWO_TITLE = "White short tee + Grey training shorts";

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
