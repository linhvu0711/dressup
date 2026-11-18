import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const STARTER = [
	"White #F4F2ED",
	"Black #1B1B1F",
	"Navy #1F3A5F",
	"Charcoal #3A3F47",
	"Grey #8C8A84",
	"Beige #D9CBB0",
	"Khaki #B8A57C",
	"Olive #6A6B3C",
	"Light blue #BFD3EA",
	"Brown #7A5638",
	"Cream #EDE4CF",
	"Burgundy #6E1F2F",
	"Mustard #C9962B",
];

const rows = (page: Page) =>
	page.locator('[data-slot="colour-list"]').getByRole("button");

const rowNames = (page: Page) =>
	rows(page).evaluateAll((buttons) =>
		buttons.map((b) => b.getAttribute("aria-label")),
	);

test("opens the Labels page from the main bar", async ({ page }) => {
	// Given: a fresh account, / open
	await page.goto("/");
	// When
	await page
		.getByRole("navigation", { name: "Main" })
		.getByRole("link", { name: "Labels" })
		.click();
	// Then
	await expect(page.getByRole("heading", { level: 1 })).toHaveText("Labels");
	expect({
		url: new URL(page.url()).pathname,
		add: await page.getByRole("button", { name: "Add a colour" }).isVisible(),
	}).toEqual({ url: "/labels", add: true });
});

test("lists the starter colours with swatch, name, and code", async ({
	page,
}) => {
	// Given: a fresh account
	// When
	await page.goto("/labels");
	// Then
	await expect(rows(page)).toHaveCount(13);
	expect({
		names: await rowNames(page),
		swatch: await page
			.locator('[data-slot="colour-swatch"]')
			.first()
			.evaluate((el) => getComputedStyle(el).backgroundColor),
	}).toEqual({ names: STARTER, swatch: "rgb(244, 242, 237)" });
});
