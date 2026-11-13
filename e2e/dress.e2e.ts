import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const WALL =
	"linear-gradient(90deg, rgb(198, 194, 188) 0%, rgb(218, 214, 208) 40%, rgb(211, 207, 201) 70%, rgb(195, 191, 185) 100%)";

async function box(page: Page, selector: string) {
	const found = await page.locator(selector).boundingBox();
	if (!found) throw new Error(`no box for ${selector}`);
	return found;
}

async function readWall(page: Page) {
	const wall = await page
		.locator('[data-surface="wall"]')
		.evaluate((el) => getComputedStyle(el).backgroundImage);
	const gear = await page
		.locator('[data-surface="wall"]')
		.getByRole("link", { name: "Settings" })
		.evaluate((el) => getComputedStyle(el).backgroundColor);
	return { wall, gear };
}

test("shows the whole mannequin on the wall", async ({ page }) => {
	// Given: both projects, phone 375x812 and laptop 1440x900
	await page.goto("/");
	// When
	const wall = await box(page, '[data-surface="wall"]');
	const found = await page
		.getByRole("img", { name: /^Mannequin/ })
		.boundingBox();
	if (!found) throw new Error("no mannequin");
	const figure = found;
	// Then
	expect({
		top: figure.y >= wall.y,
		bottom: figure.y + figure.height <= wall.y + wall.height,
		inside:
			figure.x >= wall.x && figure.x + figure.width <= wall.x + wall.width,
		ratio: Math.abs(figure.width / figure.height - 0.5) < 0.01,
	}).toEqual({ top: true, bottom: true, inside: true, ratio: true });
});

test("draws the grey wall in light theme", async ({ page, viewport }) => {
	test.skip(
		(viewport?.width ?? 0) >= 900,
		"the gear sits on the wall only under 900 px",
	);
	// Given: the default colorScheme "light"
	await page.goto("/");
	// When
	const read = await readWall(page);
	// Then
	expect(read).toEqual({ wall: WALL, gear: "rgb(255, 255, 255)" });
});

test.describe("dark device", () => {
	test.use({ colorScheme: "dark" });

	test("keeps the wall grey and its gear light in dark theme", async ({
		page,
		viewport,
	}) => {
		test.skip(
			(viewport?.width ?? 0) >= 900,
			"the gear sits on the wall only under 900 px",
		);
		// Given: colorScheme "dark"
		await page.goto("/");
		// When
		const read = await readWall(page);
		const body = await page.evaluate(
			() => getComputedStyle(document.body).backgroundColor,
		);
		// Then
		expect({ ...read, body }).toEqual({
			wall: WALL,
			gear: "rgb(255, 255, 255)",
			body: "rgb(18, 17, 16)",
		});
	});
});

test("starts with Polo + sweater", async ({ page }) => {
	// Given: both projects, a fresh page
	await page.goto("/");
	// When
	const figure = page.getByRole("img", {
		name: "Mannequin in Polo + sweater",
		exact: true,
	});
	// Then
	await expect(figure).toBeVisible();
});

const CARDS = '[data-slot="mode-cards"]';

test("picks one mode in each tab", async ({ page }) => {
	// Given: both projects, a fresh page
	await page.goto("/");
	for (const [tab, card] of [
		["Hot", "Tee + casual shorts"],
		["Cool", "Long polo + chino pants"],
		["Cold", "Shirt + sweater + padded"],
		["Training", "Long training tee + pants"],
	]) {
		// When
		await page.getByRole("tab", { name: tab, exact: true }).click();
		const button = page.getByRole("button", { name: card, exact: true });
		await button.click();
		// Then
		await expect(
			page.getByRole("img", { name: `Mannequin in ${card}`, exact: true }),
		).toBeVisible();
		await expect(button).toHaveAttribute("aria-pressed", "true");
	}
});

test("shows the two training modes under Training", async ({ page }) => {
	// Given: both projects, a fresh page
	await page.goto("/");
	// When
	await page.getByRole("tab", { name: "Training", exact: true }).click();
	// Then
	await expect(page.locator(`${CARDS} button[aria-pressed]`)).toHaveText([
		"Training tee + shorts",
		"Long training tee + pants",
	]);
});

test("labels a training mode in its weather tab", async ({ page }) => {
	// Given: both projects, a fresh page
	await page.goto("/");
	const labels = page.locator(CARDS).getByText("Training", { exact: true });
	// When
	await page.getByRole("tab", { name: "Hot", exact: true }).click();
	// Then
	await expect(labels).toHaveCount(1);
	// When
	await page.getByRole("tab", { name: "Training", exact: true }).click();
	// Then
	await expect(labels).toHaveCount(0);
});

test("outlines the picked card whole on each side", async ({ page }) => {
	// Given: both projects, a fresh page on tab "Cold"
	await page.goto("/");
	// When
	const first = page.getByRole("button", {
		name: "Tee + sweater",
		exact: true,
	});
	await first.click();
	await expect(first).toHaveAttribute("aria-pressed", "true");
	const style = await first.locator('[data-slot="mode-pic"]').evaluate((el) => {
		const s = getComputedStyle(el);
		return {
			outline: `${s.outlineWidth} ${s.outlineStyle}`,
			offset: s.outlineOffset,
		};
	});
	const fits = await page.evaluate((cards) => {
		const scroller = document.querySelector(cards)?.getBoundingClientRect();
		if (!scroller) return false;
		const pics = Array.from(
			document.querySelectorAll(`${cards} [data-slot="mode-pic"]`),
			(p) => p.getBoundingClientRect(),
		);
		const top = Math.min(...pics.map((p) => p.y));
		return (
			pics.every(
				(p) => p.x - 4.5 >= scroller.x && p.right + 4.5 <= scroller.right,
			) && top - 4.5 >= scroller.y
		);
	}, CARDS);
	// Then: the class sets 2.5px; Chromium reports outline-offset in whole
	// pixels, so the computed value is 2px. The fit check keeps 4.5px of room.
	expect({ ...style, fits }).toEqual({
		outline: "2px solid",
		offset: "2px",
		fits: true,
	});
});

test("puts the stage above the Mode tab under 900 px", async ({
	page,
	viewport,
}) => {
	test.skip((viewport?.width ?? 0) >= 900, "phone layout only");
	// Given: a fresh page
	await page.goto("/");
	// When
	const wall = await box(page, '[data-surface="wall"]');
	const tab = await page
		.getByRole("tab", { name: "Mode", exact: true })
		.boundingBox();
	if (!tab) throw new Error("no Mode tab");
	// Then
	expect({ stageAbove: wall.y + wall.height <= tab.y }).toEqual({
		stageAbove: true,
	});
});

test("scrolls the cards inside the panel on the phone", async ({
	page,
	viewport,
}) => {
	test.skip((viewport?.width ?? 0) >= 900, "phone layout only");
	// Given: a fresh page on tab "Cold", 9 cards
	await page.goto("/");
	// When
	const sizes = await page
		.locator(CARDS)
		.evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight }));
	const cards = await box(page, CARDS);
	const nav = await page
		.getByRole("navigation", { name: "Main" })
		.boundingBox();
	if (!nav) throw new Error("no bottom bar");
	// Then
	expect({
		scrolls: sizes.scroll > sizes.client,
		aboveNav: cards.y + cards.height <= nav.y,
	}).toEqual({ scrolls: true, aboveNav: true });
});

test("puts the modes left of the stage from 900 px", async ({
	page,
	viewport,
}) => {
	test.skip((viewport?.width ?? 0) < 900, "laptop layout only");
	// Given: a fresh page
	await page.goto("/");
	// When
	const tabs = await page
		.getByRole("tablist", { name: "Weather" })
		.boundingBox();
	if (!tabs) throw new Error("no Weather tabs");
	const wall = await box(page, '[data-surface="wall"]');
	// Then
	expect({
		modesLeft: tabs.x + tabs.width <= wall.x,
		roomRight: 1440 - (wall.x + wall.width) >= 300,
	}).toEqual({ modesLeft: true, roomRight: true });
});

test("starts each weather tab's cards at the top", async ({ page }) => {
	// Given: both projects, tab "Cold" scrolled to its last card
	await page.goto("/");
	await page.locator(CARDS).evaluate((el) => {
		el.scrollTop = el.scrollHeight;
	});
	// When
	await page.getByRole("tab", { name: "Cool", exact: true }).click();
	const top = await page.locator(CARDS).evaluate((el) => el.scrollTop);
	// Then
	expect(top).toBe(0);
});
