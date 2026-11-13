import { expect, type Page, test } from "@playwright/test";

const ROWS = '[data-slot="colour-rows"]';

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 0) < 900;

async function openColours(page: Page) {
	await page.goto("/");
	if (isPhone(page)) {
		await page.getByRole("tab", { name: "Colours", exact: true }).click();
	}
}

async function showModes(page: Page) {
	if (isPhone(page)) {
		await page.getByRole("tab", { name: "Mode", exact: true }).click();
	}
}

const squares = (page: Page, garment: string) =>
	page
		.locator(ROWS)
		.getByRole("group", { name: garment, exact: true })
		.locator("button[aria-pressed]");

async function labels(page: Page, garment: string) {
	return squares(page, garment).evaluateAll((els) =>
		els.map((el) => el.getAttribute("aria-label")),
	);
}

const garmentIn = (page: Page, mode: string, garment: string) =>
	page
		.getByRole("img", { name: `Mannequin in ${mode}`, exact: true })
		.locator(`[data-garment="${garment}"]`);

test("lists one row per garment, top layer first", async ({ page }) => {
	// Given: both projects, a fresh page, the Colours tab on the phone
	await openColours(page);
	// When
	const names = await page
		.locator(`${ROWS} [data-slot="colour-row-name"]`)
		.allTextContents();
	const sweater = await labels(page, "Sweater");
	// Then
	expect({ names, sweater }).toEqual({
		names: ["Sweater", "Long polo", "Chino pants"],
		sweater: [
			"Sweater #1F3A5F",
			"Sweater #8C8A84",
			"Sweater #E6DFD0",
			"Sweater #7A2E2E",
		],
	});
});

test("puts a clicked square on the garment", async ({ page }) => {
	// Given: both projects, a fresh page, the Colours tab on the phone
	await openColours(page);
	const red = page.getByRole("button", {
		name: "Sweater #7A2E2E",
		exact: true,
	});
	// When
	await red.click();
	// Then
	await expect(red).toHaveAttribute("aria-pressed", "true");
	await expect(
		page.getByRole("button", { name: "Sweater #1F3A5F", exact: true }),
	).toHaveAttribute("aria-pressed", "false");
	expect(
		await garmentIn(page, "Polo + sweater", "sweater").innerHTML(),
	).toContain('fill="#7A2E2E"');
});

test("outlines the picked square whole on each side", async ({ page }) => {
	// Given: both projects, a fresh page, the Colours tab on the phone; the
	// first square of each row is the picked one
	await openColours(page);
	const first = page.getByRole("button", {
		name: "Long polo #F3F1EC",
		exact: true,
	});
	await expect(first).toHaveAttribute("aria-pressed", "true");
	// When
	const style = await first.evaluate((el) => {
		const s = getComputedStyle(el);
		return {
			outline: `${s.outlineWidth} ${s.outlineStyle}`,
			offset: s.outlineOffset,
		};
	});
	const fits = await page.evaluate((rows) => {
		const scroller = document.querySelector(rows)?.getBoundingClientRect();
		if (!scroller) return false;
		const boxes = Array.from(
			document.querySelectorAll(`${rows} button[aria-pressed]`),
			(b) => b.getBoundingClientRect(),
		);
		const top = Math.min(...boxes.map((b) => b.y));
		return (
			boxes.every(
				(b) => b.x - 4.5 >= scroller.x && b.right + 4.5 <= scroller.right,
			) && top - 4.5 >= scroller.y
		);
	}, ROWS);
	// Then: the class sets 2.5px; Chromium reports outline-offset in whole
	// pixels, so the computed value is 2px. The fit check keeps 4.5px of room.
	expect({ ...style, fits }).toEqual({
		outline: "2px solid",
		offset: "2px",
		fits: true,
	});
});

test("keeps a colour in another mode", async ({ page }) => {
	// Given: both projects, a fresh page, the sweater picked in dark red
	await openColours(page);
	await page
		.getByRole("button", { name: "Sweater #7A2E2E", exact: true })
		.click();
	await showModes(page);
	// When
	await page
		.getByRole("button", { name: "Tee + sweater", exact: true })
		.click();
	// Then
	expect(
		await garmentIn(page, "Tee + sweater", "sweater").innerHTML(),
	).toContain('fill="#7A2E2E"');
});

test("dresses the mode cards in the picked colours", async ({ page }) => {
	// Given: both projects, a fresh page, the sweater picked in dark red
	await openColours(page);
	await page
		.getByRole("button", { name: "Sweater #7A2E2E", exact: true })
		.click();
	await showModes(page);
	// When
	const card = await page
		.getByRole("button", { name: "Tee + sweater", exact: true })
		.locator('[data-garment="sweater"]')
		.innerHTML();
	// Then
	expect(card).toContain('fill="#7A2E2E"');
});

test("puts the rows under a Colours tab under 900 px", async ({ page }) => {
	test.skip(!isPhone(page), "phone layout only");
	// Given: a fresh page
	await page.goto("/");
	const tab = page.getByRole("tab", { name: "Colours", exact: true });
	// When
	await tab.click();
	// Then
	await expect(page.getByRole("tab")).toHaveText(["Mode", "Colours"]);
	await expect(tab).toHaveAttribute("aria-selected", "true");
	await expect(
		page.getByRole("button", { name: "Sweater #1F3A5F", exact: true }),
	).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Polo + sweater", exact: true }),
	).toBeHidden();
	const wall = await page.locator('[data-surface="wall"]').boundingBox();
	const box = await tab.boundingBox();
	if (!wall || !box) throw new Error("no wall or tab");
	expect(wall.y + wall.height <= box.y).toBe(true);
});

test("puts the rows right of the stage from 900 px", async ({ page }) => {
	test.skip(isPhone(page), "laptop layout only");
	// Given: a fresh page
	await page.goto("/");
	// When
	const title = await page.locator('[data-slot="colours-title"]').boundingBox();
	const wall = await page.locator('[data-surface="wall"]').boundingBox();
	const tabs = await page
		.getByRole("tablist", { name: "Weather" })
		.boundingBox();
	if (!title || !wall || !tabs) throw new Error("no title, wall, or tabs");
	// Then
	expect({
		rowsRight: title.x >= wall.x + wall.width,
		modesLeft: tabs.x + tabs.width <= wall.x,
	}).toEqual({ rowsRight: true, modesLeft: true });
	await expect(
		page.getByRole("button", { name: "Sweater #1F3A5F", exact: true }),
	).toBeVisible();
});

test.describe("dark device", () => {
	test.use({ colorScheme: "dark" });

	test("rings each square in light in dark theme", async ({ page }) => {
		// Given: colorScheme "dark", a fresh page, the Colours tab on the phone
		await openColours(page);
		// When
		const ring = await page
			.getByRole("button", { name: "Long polo #1B1B1F", exact: true })
			.evaluate((el) => getComputedStyle(el).boxShadow);
		// Then
		expect(ring).toBe("rgba(244, 241, 234, 0.3) 0px 0px 0px 1px inset");
	});
});
