import { readFileSync } from "node:fs";
import type { BrowserContext, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { aiAppFile, type aiAppTests } from "./global-setup";

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
	const guide = page.locator('[data-slot="ai-app-guide"]');
	await expect(empty).toBeVisible();
	const [emptyBox, guideBox] = [
		await empty.boundingBox(),
		await guide.boundingBox(),
	];
	const opened = guide.locator('[data-slot="ai-app-guide-steps"]');
	const closed = {
		cards: await guide.getByRole("button").allTextContents(),
		open: await opened.count(),
	};
	// Each card opens in turn, and the one before it closes.
	const steps: Record<string, { steps: string[]; code: string[] }> = {};
	for (const name of ["Claude", "ChatGPT", "Claude Code"]) {
		await guide.getByRole("button", { name, exact: true }).click();
		await expect(opened).toHaveCount(1);
		steps[name] = {
			steps: await opened
				.locator('[data-slot="ai-app-guide-step"]')
				.allTextContents(),
			code: await opened.locator("code").allTextContents(),
		};
	}
	expect({
		address: await page.locator('[data-slot="ai-app-address"]').textContent(),
		empty: await empty.textContent(),
		emptyAboveGuide: (emptyBox?.y ?? 0) < (guideBox?.y ?? 0),
		closed,
		steps,
	}).toEqual({
		address: AI_ADDRESS,
		empty: NO_AI_APPS,
		emptyAboveGuide: true,
		closed: {
			cards: [
				"ClaudeDesktop or web",
				"ChatGPTDesktop or web",
				"Claude CodeTerminal",
			],
			open: 0,
		},
		steps: {
			Claude: {
				steps: [
					"Open Customize › Connectors",
					"Click Add › Add custom connector",
					"Paste this address",
				],
				code: [AI_ADDRESS],
			},
			ChatGPT: {
				steps: [
					"Open Plugins and click +",
					"Click Add custom MCP server",
					"Paste this address",
				],
				code: [AI_ADDRESS],
			},
			"Claude Code": {
				steps: ["Run this in a terminal", "Type /mcp and sign in"],
				code: [`claude mcp add --transport http dressup ${AI_ADDRESS}`, "/mcp"],
			},
		},
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

	test("copies the Claude Code command", async ({ page }) => {
		// Given: both projects, a fresh account, /settings, the Claude Code card open
		await page.goto("/settings");
		await page
			.getByRole("button", { name: "Claude Code", exact: true })
			.click();
		// When
		await page.getByRole("button", { name: "Copy command" }).click();
		// Then
		await expect(page.locator('[data-slot="toast"]')).toHaveText("Copied");
		expect({
			toast: await page.locator('[data-slot="toast"]').textContent(),
			clipboard: await page.evaluate(() => navigator.clipboard.readText()),
		}).toEqual({
			toast: "Copied",
			clipboard: `claude mcp add --transport http dressup ${AI_ADDRESS}`,
		});
	});
});

// This project's own account with "Test App" allowed (e2e/global-setup.ts).
async function signInWithAiApp(
	context: BrowserContext,
	project: string,
	use: (typeof aiAppTests)[number],
) {
	await context.clearCookies();
	await context.addCookies(
		JSON.parse(readFileSync(aiAppFile(project, use), "utf8")).cookies,
	);
}

const routeTestAppLogo = (page: Page) =>
	page.route("https://client.example/logo.png", (route) =>
		route.fulfill({ path: "public/icon-64.png" }),
	);

const aiAppRow = (page: Page) => page.locator('[data-slot="ai-app"]');

test("lists a connected AI app with its logo and connect date", async ({
	page,
	context,
}, testInfo) => {
	// Given: both projects, this project's account with Test App allowed
	await signInWithAiApp(context, testInfo.project.name, "list");
	await routeTestAppLogo(page);
	// When
	await page.goto("/settings");
	// Then
	const logo = aiAppRow(page).getByRole("img", { name: "Test App" });
	await expect(logo).toBeVisible();
	expect({
		logo: await logo.isVisible(),
		text: await aiAppRow(page)
			.locator('[data-slot="ai-app-name"]')
			.textContent(),
		empty: await page.getByText(NO_AI_APPS, { exact: true }).count(),
	}).toEqual({ logo: true, text: "Test AppConnected 14 Nov 2026", empty: 0 });
});

test("shows Could not load your AI apps when the list fails", async ({
	page,
}) => {
	// Given: both projects, a fresh account, the list answered 500
	await page.route("**/api/ai-apps", (route) =>
		route.fulfill({ status: 500, json: {} }),
	);
	// When
	await page.goto("/settings");
	// Then
	const alert = page.getByRole("alert");
	await expect(alert).toHaveText("Could not load your AI apps. Try again.");
	expect({
		alert: await alert.textContent(),
		tryAgain: await page
			.getByRole("button", { name: "Try again", exact: true })
			.isVisible(),
		empty: await page.getByText(NO_AI_APPS, { exact: true }).count(),
	}).toEqual({
		alert: "Could not load your AI apps. Try again.",
		tryAgain: true,
		empty: 0,
	});
});

test("disconnects an AI app", async ({ page, context }, testInfo) => {
	// Given: both projects, this project's account with Test App allowed,
	// /settings showing its row
	await signInWithAiApp(context, testInfo.project.name, "disconnect");
	await routeTestAppLogo(page);
	await page.goto("/settings");
	await expect(aiAppRow(page)).toHaveCount(1);
	// When
	await page
		.getByRole("button", { name: "Disconnect Test App", exact: true })
		.click();
	// Then
	const toast = page.locator('[data-slot="toast"]');
	await expect(toast).toHaveText("Disconnected");
	await expect(aiAppRow(page)).toHaveCount(0);
	expect({
		toast: await toast.textContent(),
		rows: await aiAppRow(page).count(),
		empty: await page.getByText(NO_AI_APPS, { exact: true }).textContent(),
		stored: await (await page.request.get("/api/ai-apps")).json(),
	}).toEqual({
		toast: "Disconnected",
		rows: 0,
		empty: NO_AI_APPS,
		stored: { apps: [] },
	});
});

test("keeps the app and says Not disconnected when the disconnect fails", async ({
	page,
}) => {
	// Given: both projects, a fresh account; the list holds Test App, and its
	// disconnect is answered 500
	await page.route("**/api/ai-apps**", (route) =>
		route.request().method() === "DELETE"
			? route.fulfill({ status: 500 })
			: route.fulfill({
					json: {
						apps: [
							{
								id: "allow-1",
								name: "Test App",
								logo: null,
								connectedAt: "2026-11-14T12:00:00.000Z",
							},
						],
					},
				}),
	);
	await page.goto("/settings");
	// When
	await page
		.getByRole("button", { name: "Disconnect Test App", exact: true })
		.click();
	// Then
	const alert = aiAppRow(page).getByRole("alert");
	await expect(alert).toHaveText("Not disconnected. Try again.");
	expect({
		alert: await alert.textContent(),
		rows: await aiAppRow(page).count(),
	}).toEqual({ alert: "Not disconnected. Try again.", rows: 1 });
});
