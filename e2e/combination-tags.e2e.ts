import type { Page } from "@playwright/test";
import {
	colourIds,
	pick,
	postCombinations,
	three,
} from "./combination-helpers";
import { expect, test } from "./fixtures";

const saveDialog = (page: Page) =>
	page.getByRole("dialog", { name: "Save combination" });

const pills = (page: Page) => page.locator('[data-slot="combination-tag"]');

const toast = (page: Page) => page.locator('[data-slot="toast"]');

// Copied from e2e/tags.e2e.ts, which #77 deletes.
async function postTag(page: Page, name: string) {
	const res = await page.request.post("/api/tags", { data: { name } });
	expect(res.status()).toBe(201);
	return ((await res.json()) as { tag: { id: string } }).tag.id;
}

const storedCombinations = async (page: Page) =>
	(
		(await (await page.request.get("/api/combinations")).json()) as {
			combinations: { id: string; tags: string[] }[];
		}
	).combinations;

// THREE, saved with the tags work and weekend.
async function threeWithWorkAndWeekend(page: Page) {
	await page.goto("/");
	const work = await postTag(page, "work");
	const weekend = await postTag(page, "weekend");
	const saved = { ...three(await colourIds(page)), tags: [work, weekend] };
	await postCombinations(page, saved);
	return { id: saved.id, work, weekend };
}

async function typeNewTag(page: Page, name: string) {
	await saveDialog(page).getByRole("button", { name: "+ New tag" }).click();
	await saveDialog(page).getByRole("textbox", { name: "New tag" }).fill(name);
	await page.keyboard.press("Enter");
	await expect(
		saveDialog(page).getByRole("button", { name, exact: true }),
	).toHaveAttribute("aria-pressed", "true");
}

test("puts two new tags on a combination in the save form", async ({
	page,
}) => {
	// Given: both projects, a fresh account, /build, Navy casual pants and
	// Black long tee picked
	await page.goto("/build");
	await pick(page, "Bottom", "Casual pants", "Navy");
	await pick(page, "Inner top", "Long tee", "Black");
	// When
	await page.getByRole("button", { name: "Save" }).click();
	await typeNewTag(page, "work");
	await typeNewTag(page, "weekend");
	// Then
	await expect(saveDialog(page)).toHaveText(
		/Black long tee \+ Navy casual pants\s*Tags\s*work\s*weekend\s*\+ New tag/,
	);
	await expect(saveDialog(page).locator('[aria-pressed="true"]')).toHaveText([
		"work",
		"weekend",
	]);
	// When
	await saveDialog(page).getByRole("button", { name: "Save" }).click();
	// Then
	await expect(page).toHaveURL("/combinations");
	const tags = (
		(await (await page.request.get("/api/tags")).json()) as {
			tags: { id: string; name: string }[];
		}
	).tags;
	const ids = (name: string) => tags.find((t) => t.name === name)?.id;
	const stored = await storedCombinations(page);
	expect(stored.map((c) => c.tags)).toEqual([[ids("work"), ids("weekend")]]);
});

test("shows the tags as pills on the combination page", async ({ page }) => {
	// Given: both projects, a fresh account, THREE with work and weekend
	const { id } = await threeWithWorkAndWeekend(page);
	// When
	await page.goto(`/combinations/${id}`);
	// Then
	await expect(pills(page)).toHaveText(["work", "weekend"]);
});

test("shows no pill row for a combination with no tags", async ({ page }) => {
	// Given: both projects, a fresh account, THREE with no tags
	await page.goto("/");
	const saved = three(await colourIds(page));
	await postCombinations(page, saved);
	// When
	await page.goto(`/combinations/${saved.id}`);
	// Then
	await expect(page.locator('[data-slot="piece-line"]')).toHaveCount(3);
	await expect(page.locator('[data-slot="combination-tags"]')).toHaveCount(0);
});

test("keeps a combination's tags on Save changes when the tags do not load", async ({
	page,
}) => {
	// Given: both projects, a fresh account, THREE with work and weekend;
	// every GET of the tags answers 500
	const { id, work, weekend } = await threeWithWorkAndWeekend(page);
	await page.route("**/api/tags", (route) =>
		route.request().method() === "GET"
			? route.fulfill({ status: 500 })
			: route.continue(),
	);
	// When
	await page.goto(`/build/${id}`);
	await page.getByRole("button", { name: "Save" }).click();
	await saveDialog(page).getByRole("button", { name: "Save changes" }).click();
	// Then
	await expect(toast(page)).toHaveText("Changes saved");
	const stored = await storedCombinations(page);
	expect(stored.find((c) => c.id === id)?.tags).toEqual([work, weekend]);
});

test("takes a tag off with Save changes", async ({ page }) => {
	// Given: both projects, a fresh account, THREE with work and weekend
	const { id } = await threeWithWorkAndWeekend(page);
	// When
	await page.goto(`/build/${id}`);
	await page.getByRole("button", { name: "Save" }).click();
	await saveDialog(page)
		.getByRole("button", { name: "weekend", exact: true })
		.click();
	await saveDialog(page).getByRole("button", { name: "Save changes" }).click();
	// Then
	await expect(toast(page)).toHaveText("Changes saved");
	await expect(pills(page)).toHaveText(["work"]);
});
