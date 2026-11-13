import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const ROWS = '[data-slot="colour-rows"]';

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 0) < 900;

async function openColours(page: Page) {
	await page.goto("/");
	if (isPhone(page)) {
		await page.getByRole("tab", { name: "Colours", exact: true }).click();
	}
	await expect(page.locator(ROWS)).toBeVisible();
}

const square = (page: Page, name: string) =>
	page.getByRole("button", { name, exact: true });

const sweaterIn = (page: Page, mode: string) =>
	page.locator(
		`svg[aria-label="Mannequin in ${mode}"] [data-garment="sweater"]`,
	);

test("keeps the colours after a reload and on a second device", async ({
	page,
	browser,
	storageState,
}) => {
	// Given: both projects, a claimed account, the Colours tab on the phone
	await openColours(page);
	// When
	const stored = page.waitForResponse(
		(res) => res.url().endsWith("/api/dress/changes") && res.status() === 204,
	);
	await square(page, "Sweater #7A2E2E").click();
	await stored;
	await page.reload();
	if (isPhone(page)) {
		await page.getByRole("tab", { name: "Colours", exact: true }).click();
	}
	const second = await browser.newContext({
		storageState,
		viewport: page.viewportSize(),
	});
	const other = await second.newPage();
	await openColours(other);
	// Then
	for (const p of [page, other]) {
		await expect(square(p, "Sweater #7A2E2E")).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		expect(await sweaterIn(p, "Polo + sweater").innerHTML()).toContain(
			'fill="#7A2E2E"',
		);
	}
	await second.close();
});
