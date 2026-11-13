import { expect, type Page, test } from "@playwright/test";

async function readLook(page: Page) {
	const main = await page.getByRole("main").evaluate((el) => {
		const style = getComputedStyle(el);
		return {
			background: style.backgroundColor,
			color: style.color,
			font: style.fontFamily,
		};
	});
	const title = await page
		.locator("h1")
		.evaluate((el) => getComputedStyle(el).fontFamily);
	return { ...main, title };
}

test("shows the privacy page at /privacy", async ({ page }) => {
	// Given: the dev server Playwright starts; no cookies
	// When
	await page.goto("/privacy");
	// Then
	await expect(page.locator("h1")).toHaveText("Privacy");
	await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
});

test("draws the privacy page in the light tokens and the app's fonts", async ({
	page,
}) => {
	// Given: the default colorScheme "light"
	// When
	await page.goto("/privacy");
	const look = await readLook(page);
	// Then
	expect({ background: look.background, color: look.color }).toEqual({
		background: "rgb(251, 250, 248)",
		color: "rgb(26, 25, 23)",
	});
	expect(look.font.startsWith("Geist,")).toBe(true);
	expect(look.title.startsWith('"Instrument Serif"')).toBe(true);
});

test.describe("dark device", () => {
	test.use({ colorScheme: "dark" });

	test("draws the privacy page in the dark tokens on a dark device", async ({
		page,
	}) => {
		// Given: colorScheme "dark"
		// When
		await page.goto("/privacy");
		const look = await readLook(page);
		// Then
		expect({ background: look.background, color: look.color }).toEqual({
			background: "rgb(18, 17, 16)",
			color: "rgb(244, 241, 234)",
		});
	});
});

test("fits the page width with no side scroll", async ({ page }, testInfo) => {
	// Given: both projects, phone 375x812 and laptop 1440x900
	// When
	await page.goto("/privacy");
	const scrollWidth = await page.evaluate(
		() => document.documentElement.scrollWidth,
	);
	const article = await page.locator("article").boundingBox();
	// Then
	const expected = {
		phone: { scrollWidth: 375, article: 375 },
		laptop: { scrollWidth: 1440, article: 640 },
	}[testInfo.project.name];
	expect({ scrollWidth, article: article?.width }).toEqual(expected);
});
