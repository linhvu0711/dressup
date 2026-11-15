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

const confirm = (page: Page) =>
	page.getByRole("alertdialog", { name: "Delete your account?" });

async function openDeleteConfirm(page: Page) {
	await page.goto("/settings");
	await page.getByRole("button", { name: "Delete my account" }).click();
	await expect(confirm(page)).toBeVisible();
}

test("opens the delete confirm from the bin button", async ({ page }) => {
	// Given: both projects, a fresh account, the Settings page
	await page.goto("/settings");
	// When
	await page.getByRole("button", { name: "Delete my account" }).click();
	// Then
	await expect(confirm(page)).toContainText(
		"All your looks and colours go away for good. You cannot undo this.",
	);
	await expect(
		confirm(page).getByRole("button", { name: "Cancel", exact: true }),
	).toBeVisible();
	await expect(
		confirm(page).getByRole("button", { name: "Delete", exact: true }),
	).toBeVisible();
});

test("deletes the account and shows the sign-in screen", async ({ page }) => {
	// Given: both projects, a fresh account, the confirm open
	await openDeleteConfirm(page);
	// When
	await confirm(page)
		.getByRole("button", { name: "Delete", exact: true })
		.click();
	// Then
	await expect(page.locator("h1")).toHaveText("dressup");
	await expect(
		page.getByRole("button", { name: "Sign in with Google" }),
	).toBeVisible();
	await expect(page.locator('[data-slot="toast"]')).toHaveText(
		"Account deleted",
	);
	expect((await page.request.get("/api/me")).status()).toBe(401);
});

test("keeps the account when the delete fails", async ({ page }) => {
	// Given: both projects, a fresh account, each delete answered 500, the
	// confirm open
	await page.route("**/api/account", (route) => route.fulfill({ status: 500 }));
	await openDeleteConfirm(page);
	// When
	await confirm(page)
		.getByRole("button", { name: "Delete", exact: true })
		.click();
	// Then
	await expect(confirm(page).getByRole("alert")).toHaveText(
		"Not deleted. Try again.",
	);
	expect((await page.request.get("/api/me")).status()).toBe(200);
});

const AI_ADDRESS = "http://localhost:5173/api/mcp";
const NO_AI_APPS = "No AI apps connected yet.";

test("shows the AI app address, the steps, and No AI apps connected yet", async ({
	page,
}) => {
	// Given: both projects, a fresh account
	// When
	await page.goto("/settings");
	// Then
	const empty = page.getByText(NO_AI_APPS, { exact: true });
	const steps = page.locator('[data-slot="ai-app-steps"]');
	await expect(empty).toBeVisible();
	const [emptyBox, stepsBox] = [
		await empty.boundingBox(),
		await steps.boundingBox(),
	];
	expect({
		address: await page.locator('[data-slot="ai-app-address"]').textContent(),
		empty: await empty.textContent(),
		steps: await steps.locator("li").allTextContents(),
		emptyAboveSteps: (emptyBox?.y ?? 0) < (stepsBox?.y ?? 0),
	}).toEqual({
		address: AI_ADDRESS,
		empty: NO_AI_APPS,
		steps: [
			"Claude: Customize, Connectors, Add, Add custom connector, then paste the address.",
			"ChatGPT: Plugins, +, Add custom MCP server, then paste the address.",
			`Claude Code: run claude mcp add --transport http dressup ${AI_ADDRESS}, then /mcp to sign in.`,
		],
		emptyAboveSteps: true,
	});
});

test.describe("AI app address on the clipboard", () => {
	test.use({ permissions: ["clipboard-read", "clipboard-write"] });

	test("copies the AI app address", async ({ page }) => {
		// Given: both projects, a fresh account, /settings
		await page.goto("/settings");
		// When
		await page.getByRole("button", { name: "Copy", exact: true }).click();
		// Then
		await expect(page.locator('[data-slot="toast"]')).toHaveText("Copied");
		expect({
			toast: await page.locator('[data-slot="toast"]').textContent(),
			clipboard: await page.evaluate(() => navigator.clipboard.readText()),
		}).toEqual({ toast: "Copied", clipboard: AI_ADDRESS });
	});
});
