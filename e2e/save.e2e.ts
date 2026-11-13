import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { claimAccount, expect, test } from "./fixtures";

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

test("opens the modes on the tab of the stored mode", async ({ page }) => {
	// Given: both projects, a claimed account; "Tee + casual shorts" picked
	// under Hot and stored
	await page.goto("/");
	await page.getByRole("tab", { name: "Hot", exact: true }).click();
	const stored = page.waitForResponse(
		(res) => res.url().endsWith("/api/dress/changes") && res.status() === 204,
	);
	await page
		.getByRole("button", { name: "Tee + casual shorts", exact: true })
		.click();
	await stored;
	// When
	await page.reload();
	// Then
	await expect(
		page.getByRole("tab", { name: "Hot", exact: true }),
	).toHaveAttribute("aria-selected", "true");
	await expect(
		page.getByRole("button", { name: "Tee + casual shorts", exact: true }),
	).toHaveAttribute("aria-pressed", "true");
});

test("shows the grey mannequin while the colours load", async ({ page }) => {
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
	await page.goto("/");
	// Then
	await expect(page.locator('svg[aria-label="Loading"]')).toBeVisible();
	await expect(page.locator('[data-slot="mode-placeholder"]')).toHaveCount(6);
	release();
	await expect(
		page.locator('svg[aria-label="Mannequin in Polo + sweater"]'),
	).toBeVisible();
	await expect(page.locator('svg[aria-label="Loading"]')).toHaveCount(0);
});

test("keeps a failed change on screen and stores it on Retry", async ({
	page,
}) => {
	// Given: both projects, the Colours tab on the phone, every save cut off
	await openColours(page);
	await page.route("**/api/dress/changes", (route) => route.abort());
	const red = square(page, "Sweater #7A2E2E");
	const bar = page.getByRole("alert");
	// When
	await red.click();
	// Then
	await expect(red).toHaveAttribute("aria-pressed", "true");
	await expect(bar).toHaveText(/Not saved\. Check your internet\./);
	// When
	await page.unroute("**/api/dress/changes");
	await bar.getByRole("button", { name: "Retry", exact: true }).click();
	// Then
	await expect(bar).toHaveCount(0);
	await expect(page.locator('[data-slot="toast"]')).toHaveText("Saved");
	// When
	await page.reload();
	if (isPhone(page)) {
		await page.getByRole("tab", { name: "Colours", exact: true }).click();
	}
	// Then
	await expect(square(page, "Sweater #7A2E2E")).toHaveAttribute(
		"aria-pressed",
		"true",
	);
});

test("shows the sign-in screen when a save finds no session", async ({
	page,
}) => {
	// Given: both projects, the Colours tab on the phone; then the session
	// is gone for the session check and for each save
	await openColours(page);
	const noSession = { status: 401, json: { error: "unauthorized" } };
	await page.route("/api/me", (route) => route.fulfill(noSession));
	await page.route("**/api/dress/changes", (route) => route.fulfill(noSession));
	// When
	await square(page, "Sweater #7A2E2E").click();
	// Then
	await expect(
		page.getByRole("button", { name: "Sign in with Google" }),
	).toBeVisible();
});

test("shows the stored colours after a refused change", async ({ page }) => {
	// Given: both projects, the Colours tab on the phone; Sweater #7A2E2E
	// picked and stored; then each save is refused and a reload of the
	// colours never answers
	await openColours(page);
	const stored = page.waitForResponse(
		(r) => r.url().endsWith("/api/dress/changes") && r.status() === 204,
	);
	await square(page, "Sweater #7A2E2E").click();
	await stored;
	await page.route("**/api/dress/changes", (route) =>
		route.fulfill({ status: 400, json: { error: "invalid", field: "hex" } }),
	);
	await page.route("**/api/dress", () => {});
	// When
	await square(page, "Sweater #E6DFD0").click();
	// Then
	await expect(square(page, "Sweater #7A2E2E")).toHaveAttribute(
		"aria-pressed",
		"true",
	);
	await expect(square(page, "Sweater #E6DFD0")).toHaveAttribute(
		"aria-pressed",
		"false",
	);
});

test("shows the other account's colours after it signs in in another tab", async ({
	page,
}) => {
	// Given: both projects, the Colours tab on the phone; Sweater #7A2E2E
	// picked and stored, and the rows in edit mode; then the browser holds a
	// second account's session
	await openColours(page);
	const stored = page.waitForResponse(
		(r) => r.url().endsWith("/api/dress/changes") && r.status() === 204,
	);
	await square(page, "Sweater #7A2E2E").click();
	await stored;
	await page.getByRole("button", { name: "Edit colours", exact: true }).click();
	const other = JSON.parse(readFileSync(claimAccount(), "utf8"));
	await page.context().clearCookies();
	await page.context().addCookies(other.cookies);
	// When: the tab is shown again, so the session check runs again
	await page.evaluate(() =>
		window.dispatchEvent(new Event("visibilitychange")),
	);
	// Then: the page starts over, on the Mode tab on the phone
	if (isPhone(page)) {
		await expect(
			page.getByRole("tab", { name: "Mode", exact: true }),
		).toHaveAttribute("aria-selected", "true");
		await page.getByRole("tab", { name: "Colours", exact: true }).click();
	}
	await expect(
		page.getByRole("button", { name: "Edit colours", exact: true }),
	).toBeVisible();
	await expect(square(page, "Sweater #1F3A5F")).toHaveAttribute(
		"aria-pressed",
		"true",
	);
	await expect(square(page, "Sweater #7A2E2E")).toHaveAttribute(
		"aria-pressed",
		"false",
	);
});
