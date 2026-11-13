import { expect, type Page, test } from "@playwright/test";

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
