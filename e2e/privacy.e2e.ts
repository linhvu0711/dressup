import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

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

test("names what dressup keeps", async ({ page }) => {
	// Given: the dev server; no cookies
	// When
	await page.goto("/privacy");
	const items = page
		.getByRole("region", { name: "What dressup keeps" })
		.getByRole("listitem");
	// Then
	await expect(items).toHaveText([
		"Your Google account's name, email, and picture.",
		"The colours you save.",
		"The brands you save.",
		"Your last outfit.",
		"Your looks and their tags.",
		"Your combinations.",
		"Your closet.",
		"The pictures you add to your closet.",
		"Your mannequin's skin and hair colour.",
	]);
});

test("says why dressup keeps it", async ({ page }) => {
	// Given: the dev server; no cookies
	// When
	await page.goto("/privacy");
	const lines = page.getByRole("region", { name: "Why" }).locator("p");
	// Then
	await expect(lines).toHaveText([
		"dressup keeps this only to show you your own clothes and looks. Nothing is sold, shared, or used for ads.",
	]);
});

test("says where the data lives and which cookies dressup sets", async ({
	page,
}) => {
	// Given: the dev server; no cookies
	// When
	await page.goto("/privacy");
	const lines = page
		.getByRole("region", { name: "Where it lives" })
		.locator("p");
	// Then
	await expect(lines).toHaveText([
		"Cloudflare runs the app and keeps the data.",
		"Google is used only for sign-in.",
		"dressup sets only the cookies that keep you signed in. It sets no tracking cookies.",
	]);
});

test("says Settings deletes the account", async ({ page }) => {
	// Given: the dev server; no cookies
	// When
	await page.goto("/privacy");
	const region = page.getByRole("region", { name: "How to delete it" });
	// Then
	await expect(region.locator("p")).toHaveText([
		'In Settings, "Delete my account" deletes your account and all its data at once, your pictures too.',
	]);
});

test("gives the support email and the date of the last change", async ({
	page,
}) => {
	// Given: the dev server; no cookies
	// When
	await page.goto("/privacy");
	const contact = page.getByRole("region", { name: "Contact" });
	// Then
	await expect(page.getByText("Last changed: 18 November 2026")).toBeVisible();
	await expect(contact.locator("p")).toHaveText([
		"Questions about this page or your data: linh.tuan.vu.contact@gmail.com.",
	]);
	await expect(
		contact.getByRole("link", { name: "linh.tuan.vu.contact@gmail.com" }),
	).toHaveAttribute("href", "mailto:linh.tuan.vu.contact@gmail.com");
});
