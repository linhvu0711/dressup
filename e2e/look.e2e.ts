import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import {
	card,
	isPhone,
	openColours,
	openDress,
	saveLook,
	storedLooks,
} from "./looks-helpers";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

const panel = (page: Page) => page.locator('[data-slot="look-panel"]');

const toast = (page: Page) => page.locator('[data-slot="toast"]');

async function openLook(page: Page, name: string) {
	await page.goto("/looks");
	await card(page, name).click();
	await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
}

test("opens a look as a page under 900 px and beside the wall from 900 px", async ({
	page,
}) => {
	// Given: both projects, a fresh account; a look "Navy day" saved, then /looks
	await openDress(page);
	await saveLook(page, "Navy day");
	await page.goto("/looks");
	const { looks } = await storedLooks(page);
	const wall = page.locator('[data-slot="look-wall"]');
	// When
	await card(page, "Navy day").click();
	// Then
	if (isPhone(page)) {
		await expect(page).toHaveURL(`/looks/${looks[0].id}`);
		await expect(page.getByRole("link", { name: "Back" })).toBeVisible();
		await expect(wall).toBeHidden();
		await page.getByRole("link", { name: "Back" }).click();
		await expect(page).toHaveURL("/looks");
		await expect(wall).toBeVisible();
	} else {
		await expect(page).toHaveURL(`/looks/${looks[0].id}`);
		await expect(wall).toBeVisible();
		await expect(card(page, "Navy day")).toHaveAttribute(
			"aria-current",
			"true",
		);
		await expect(
			panel(page).getByRole("heading", { name: "Navy day" }),
		).toBeVisible();
	}
});

test("shows the look's mannequin, name, and garment lines", async ({
	page,
}) => {
	// Given: both projects, a fresh account; a red sweater saved with no name
	await openColours(page);
	await page
		.getByRole("button", { name: "Sweater #7A2E2E", exact: true })
		.click();
	await saveLook(page, "");
	// When
	await openLook(page, "Polo + sweater");
	// Then
	await expect(
		page.locator('[data-slot="look-view"] [data-slot="garment-line"]'),
	).toHaveText(["Sweater#7A2E2E", "Long polo#F3F1EC", "Chino pants#C9B38C"]);
	expect(
		await page
			.locator('svg[aria-label="Polo + sweater"] [data-garment="sweater"]')
			.innerHTML(),
	).toContain('fill="#7A2E2E"');
});

test("shows the newest look before a pick from 900 px", async ({ page }) => {
	test.skip(isPhone(page), "the right part shows from 900 px");
	// Given: laptop, a fresh account; looks "Older" then "Newer" saved
	await openDress(page);
	await saveLook(page, "Older");
	await saveLook(page, "Newer");
	// When
	await page.goto("/looks");
	// Then
	await expect(
		panel(page).getByRole("heading", { name: "Newer" }),
	).toBeVisible();
	await expect(card(page, "Newer")).toHaveAttribute("aria-current", "true");
	await expect(card(page, "Older")).not.toHaveAttribute("aria-current");
});

test("shows the wall for a link to a look it does not have", async ({
	page,
}) => {
	// Given: both projects, a fresh account; a look "Navy day" saved
	await openDress(page);
	await saveLook(page, "Navy day");
	// When
	await page.goto("/looks/00000000-0000-4000-8000-000000000000");
	// Then
	await expect(card(page, "Navy day")).toBeVisible();
	await expect(page.getByRole("link", { name: "Back" })).toBeHidden();
	await expect(toast(page)).toHaveCount(0);
});

test("copies a code and shows the toast", async ({ page }) => {
	// Given: both projects, a fresh account; a look "Navy day" from the
	// starter colours, open
	await openDress(page);
	await saveLook(page, "Navy day");
	await openLook(page, "Navy day");
	// When
	await page
		.locator('[data-slot="look-view"]')
		.getByRole("button", { name: "Copy #1F3A5F" })
		.click();
	// Then
	await expect(toast(page)).toHaveText("#1F3A5F copied");
	expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
		"#1F3A5F",
	);
});
