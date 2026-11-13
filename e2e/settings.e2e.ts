import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const preview = (page: Page) =>
	page.locator('svg[aria-label="Mannequin preview"]');

const row = (page: Page, name: string) =>
	page.getByRole("button", { name, exact: true });

async function openSkinPicker(page: Page) {
	await page.goto("/settings");
	await row(page, "Skin colour #D6A27B").click();
	return page.getByRole("dialog", { name: "Skin colour" });
}

const storedChange = (page: Page) =>
	page.waitForResponse(
		(res) => res.url().endsWith("/api/dress/changes") && res.status() === 204,
	);

test("shows the skin and hair rows with a preview", async ({ page }) => {
	// Given: both projects, a fresh account
	// When
	await page.goto("/settings");
	// Then
	await expect(row(page, "Skin colour #D6A27B")).toBeVisible();
	await expect(row(page, "Hair colour #141418")).toBeVisible();
	await expect(preview(page)).toBeVisible();
	expect(await preview(page).innerHTML()).toContain('fill="#D6A27B"');
});

test("shows a typed skin colour live in the preview", async ({ page }) => {
	// Given: both projects, a fresh account, /settings
	const dialog = await openSkinPicker(page);
	// When
	await dialog.getByRole("textbox", { name: "Colour code" }).fill("8D5524");
	// Then
	await expect(dialog.locator('[data-slot="colour-area"]')).toBeVisible();
	await expect(dialog.locator('[data-slot="hue"]')).toBeVisible();
	expect(await preview(page).innerHTML()).toContain('fill="#8D5524"');
	// The open modal hides the page behind it from role queries.
	await expect(
		page.locator('[data-part="skin"] [data-slot="mannequin-code"]'),
	).toHaveText("#D6A27B");
});

test("sets the skin colour and keeps it", async ({
	page,
	browser,
	storageState,
}) => {
	// Given: both projects, a fresh account, the picker open on "Skin colour"
	const dialog = await openSkinPicker(page);
	// When
	await dialog.getByRole("textbox", { name: "Colour code" }).fill("8D5524");
	const stored = storedChange(page);
	await dialog.getByRole("button", { name: "Set", exact: true }).click();
	await stored;
	// Then
	await expect(page.locator('[data-slot="toast"]')).toHaveText(
		"Skin colour set",
	);
	// When
	await page.reload();
	const second = await browser.newContext({
		storageState,
		viewport: page.viewportSize(),
	});
	const other = await second.newPage();
	await other.goto("/settings");
	// Then
	for (const p of [page, other])
		await expect(row(p, "Skin colour #8D5524")).toBeVisible();
	await second.close();
	// When
	await page.getByRole("link", { name: "Dress" }).click();
	// Then
	const stage = page.locator('svg[aria-label="Mannequin in Polo + sweater"]');
	await expect(stage).toBeVisible();
	expect(await stage.innerHTML()).toContain('fill="#8D5524"');
});

test("sets the hair colour and says so", async ({ page }) => {
	// Given: both projects, a fresh account, /settings
	await page.goto("/settings");
	// When
	await row(page, "Hair colour #141418").click();
	const dialog = page.getByRole("dialog", { name: "Hair colour" });
	await dialog.getByRole("textbox", { name: "Colour code" }).fill("B55239");
	await dialog.getByRole("button", { name: "Set", exact: true }).click();
	// Then
	await expect(page.locator('[data-slot="toast"]')).toHaveText(
		"Hair colour set",
	);
	await expect(row(page, "Hair colour #B55239")).toBeVisible();
});

test("puts the old skin back on Cancel", async ({ page }) => {
	// Given: both projects, a fresh account, the picker open on "Skin colour"
	const dialog = await openSkinPicker(page);
	// When
	await dialog.getByRole("textbox", { name: "Colour code" }).fill("8D5524");
	await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
	// Then
	await expect(dialog).toBeHidden();
	const drawn = await preview(page).innerHTML();
	expect({
		old: drawn.includes('fill="#D6A27B"'),
		typed: drawn.includes("#8D5524"),
	}).toEqual({ old: true, typed: false });
	await expect(row(page, "Skin colour #D6A27B")).toBeVisible();
});

test("puts the old skin back on Esc", async ({ page }) => {
	// Given: both projects, a fresh account, the picker open on "Skin colour"
	const dialog = await openSkinPicker(page);
	// When
	await dialog.getByRole("textbox", { name: "Colour code" }).fill("8D5524");
	await page.keyboard.press("Escape");
	// Then
	await expect(dialog).toBeHidden();
	const drawn = await preview(page).innerHTML();
	expect({
		old: drawn.includes('fill="#D6A27B"'),
		typed: drawn.includes("#8D5524"),
	}).toEqual({ old: true, typed: false });
	await expect(row(page, "Skin colour #D6A27B")).toBeVisible();
});

test("keeps a failed skin colour on screen and shows Not saved", async ({
	page,
}) => {
	// Given: both projects, a fresh account, /settings, every save cut off
	await page.goto("/settings");
	await page.route("**/api/dress/changes", (route) => route.abort());
	const bar = page.getByRole("alert");
	// When
	await row(page, "Skin colour #D6A27B").click();
	const dialog = page.getByRole("dialog", { name: "Skin colour" });
	await dialog.getByRole("textbox", { name: "Colour code" }).fill("8D5524");
	await dialog.getByRole("button", { name: "Set", exact: true }).click();
	// Then
	await expect(row(page, "Skin colour #8D5524")).toBeVisible();
	await expect(bar).toHaveText(/Not saved\. Check your internet\./);
	// When
	await page.unroute("**/api/dress/changes");
	await bar.getByRole("button", { name: "Retry", exact: true }).click();
	// Then
	await expect(bar).toHaveCount(0);
	await expect(page.locator('[data-slot="toast"]')).toHaveText("Saved");
});

test("shows the grey preview while the colours load", async ({ page }) => {
	// Given: GET /api/dress held until the test lets it go
	let release = () => {};
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	await page.route("/api/dress", async (route) => {
		await held;
		await route.continue();
	});
	// When
	await page.goto("/settings");
	// Then
	const loading = page.locator(
		'[data-slot="mannequin-preview"] svg[aria-label="Loading"]',
	);
	await expect(loading).toBeVisible();
	await expect(row(page, "Skin colour #D6A27B")).toHaveCount(0);
	release();
	await expect(preview(page)).toBeVisible();
	await expect(loading).toHaveCount(0);
});
