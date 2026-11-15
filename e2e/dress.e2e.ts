import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { claimAccount, expect, test } from "./fixtures";
import { card, openColours, openDress, saveLook } from "./looks-helpers";

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

test("draws the stage and the mode cards in the account's skin and hair", async ({
	page,
}) => {
	// Given: both projects, a fresh account with skin #8D5524 and hair #B55239
	const stage = page.locator('svg[aria-label="Mannequin in Polo + sweater"]');
	await page.goto("/");
	await expect(stage).toBeVisible();
	for (const [part, hex] of [
		["skin", "#8D5524"],
		["hair", "#B55239"],
	]) {
		const res = await page.request.post("/api/dress/changes", {
			data: { kind: "mannequin", part, hex },
		});
		expect(res.status()).toBe(204);
	}
	// When
	await page.reload();
	// Then
	await expect(stage).toBeVisible();
	const card = await page
		.locator('[data-slot="mode-pic"] svg')
		.first()
		.innerHTML();
	expect({
		stageSkin: (await stage.innerHTML()).includes('fill="#8D5524"'),
		stageHair: (await stage.innerHTML()).includes('fill="#B55239"'),
		cardSkin: card.includes('fill="#8D5524"'),
	}).toEqual({ stageSkin: true, stageHair: true, cardSkin: true });
});

// The session check also loads on this event, as e2e/save.e2e.ts fires it.
const focusTab = (page: Page) =>
	page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));

const square = (page: Page, name: string) =>
	page.getByRole("button", { name, exact: true });

async function changeElsewhere(
	page: Page,
	change: { kind: "add" | "pick"; hex: string },
) {
	const res = await page.request.post("/api/dress/changes", {
		data: { ...change, garment: "sweater" },
	});
	expect(res.status()).toBe(204);
}

// A late answer is applied after its response event; two frames let React
// show it before a test reads the page.
const twoFrames = (page: Page) =>
	page.evaluate(
		() =>
			new Promise((done) =>
				requestAnimationFrame(() => requestAnimationFrame(done)),
			),
	);

const isDressGet = (url: string, method: string) =>
	method === "GET" && new URL(url).pathname === "/api/dress";

// Counts the loads of the dress state from now on.
function countLoads(page: Page) {
	const seen = { loads: 0 };
	page.on("request", (r) => {
		if (isDressGet(r.url(), r.method())) seen.loads++;
	});
	return seen;
}

// The session check runs on the same focus event, so its answer marks the
// moment a load on focus would already have been sent.
const sessionChecked = (page: Page) =>
	page.waitForResponse((r) => new URL(r.url()).pathname === "/api/me");

const storedSweater = async (page: Page) =>
	(
		(await (await page.request.get("/api/dress")).json()) as {
			picked: { sweater: string };
		}
	).picked.sweater;

const changeStored = (page: Page) =>
	page.waitForResponse(
		(r) => r.url().endsWith("/api/dress/changes") && r.status() === 204,
	);

test.describe("load on focus", () => {
	test("shows a colour picked in another session when the tab gets focus", async ({
		page,
	}) => {
		// Given: both projects, a fresh account, the Colours tab on the phone;
		// sweater #2E5E4E added and picked from another session
		await openColours(page);
		await changeElsewhere(page, { kind: "add", hex: "#2E5E4E" });
		await changeElsewhere(page, { kind: "pick", hex: "#2E5E4E" });
		// When
		await focusTab(page);
		// Then
		await expect(square(page, "Sweater #2E5E4E")).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		await expect
			.poll(() =>
				page
					.locator(
						'svg[aria-label="Mannequin in Polo + sweater"] [data-garment="sweater"]',
					)
					.innerHTML(),
			)
			.toContain('fill="#2E5E4E"');
	});

	test("keeps the colours when a load on focus fails", async ({ page }) => {
		// Given: both projects, a fresh account, the Colours tab on the phone;
		// sweater #7A2E2E picked from another session; each load answered 500
		await openColours(page);
		await changeElsewhere(page, { kind: "pick", hex: "#7A2E2E" });
		await page.route("/api/dress", (route) => route.fulfill({ status: 500 }));
		const failed = page.waitForResponse(
			(r) => isDressGet(r.url(), r.request().method()) && r.status() === 500,
		);
		// When
		await focusTab(page);
		await failed;
		await twoFrames(page);
		// Then
		expect({
			navy: await square(page, "Sweater #1F3A5F").getAttribute("aria-pressed"),
			alerts: await page.getByRole("alert").count(),
			toasts: await page.locator('[data-slot="toast"]').count(),
		}).toEqual({ navy: "true", alerts: 0, toasts: 0 });
	});

	test("shows the sign-in screen when a load on focus finds no session", async ({
		page,
	}) => {
		// Given: both projects, a fresh account, the Colours tab on the phone;
		// then the session check passes once and finds no session after, and
		// each load finds no session
		await openColours(page);
		const noSession = { status: 401, json: { error: "unauthorized" } };
		let checks = 0;
		await page.route("/api/me", (route) =>
			checks++ === 0 ? route.continue() : route.fulfill(noSession),
		);
		await page.route("/api/dress", (route) => route.fulfill(noSession));
		// When
		await focusTab(page);
		// Then
		await expect(
			page.getByRole("button", { name: "Sign in with Google" }),
		).toBeVisible();
	});

	test("does not load on focus while a change is sending", async ({ page }) => {
		// Given: both projects, a fresh account, the Colours tab on the phone;
		// each save held until the test lets it go; Sweater #7A2E2E clicked
		await openColours(page);
		let release = () => {};
		const held = new Promise<void>((resolve) => {
			release = resolve;
		});
		await page.route("**/api/dress/changes", async (route) => {
			await held;
			await route.continue();
		});
		await square(page, "Sweater #7A2E2E").click();
		const seen = countLoads(page);
		// When
		const checked = sessionChecked(page);
		await focusTab(page);
		await checked;
		const stored = changeStored(page);
		release();
		await stored;
		// Then
		expect({ loads: seen.loads, stored: await storedSweater(page) }).toEqual({
			loads: 0,
			stored: "#7A2E2E",
		});
	});

	test("does not load on focus while a change waits to retry", async ({
		page,
	}) => {
		// Given: both projects, a fresh account, the Colours tab on the phone;
		// every save cut off; Sweater #7A2E2E clicked and not saved; then
		// sweater #E6DFD0 picked from another session
		await openColours(page);
		await page.route("**/api/dress/changes", (route) => route.abort());
		await square(page, "Sweater #7A2E2E").click();
		const bar = page.getByRole("alert");
		await expect(bar).toHaveText(/Not saved\. Check your internet\./);
		await changeElsewhere(page, { kind: "pick", hex: "#E6DFD0" });
		const seen = countLoads(page);
		// When
		const checked = sessionChecked(page);
		await focusTab(page);
		await checked;
		await page.unroute("**/api/dress/changes");
		await bar.getByRole("button", { name: "Retry", exact: true }).click();
		await expect(page.locator('[data-slot="toast"]')).toHaveText("Saved");
		// Then
		expect({
			loads: seen.loads,
			pressed: await square(page, "Sweater #7A2E2E").getAttribute(
				"aria-pressed",
			),
			stored: await storedSweater(page),
		}).toEqual({ loads: 0, pressed: "true", stored: "#7A2E2E" });
	});

	test("keeps the edit state and does not load on focus", async ({ page }) => {
		// Given: both projects, a fresh account; "Navy day" saved and open in
		// the edit state, its outfit stored; then sweater #7A2E2E picked from
		// another session
		await openDress(page);
		await saveLook(page, "Navy day");
		await page.goto("/looks");
		await card(page, "Navy day").click();
		const worn = changeStored(page);
		await page.getByRole("button", { name: "Edit this look" }).click();
		await worn;
		await expect(page.getByText("Editing: Navy day")).toBeVisible();
		await changeElsewhere(page, { kind: "pick", hex: "#7A2E2E" });
		const seen = countLoads(page);
		// When
		const checked = sessionChecked(page);
		await focusTab(page);
		await checked;
		// Then
		expect({
			editing: await page.getByText("Editing: Navy day").count(),
			loads: seen.loads,
		}).toEqual({ editing: 1, loads: 0 });
	});

	test("keeps a colour picked while a load on focus is out", async ({
		page,
	}) => {
		// Given: both projects, a fresh account, the Colours tab on the phone;
		// sweater #7A2E2E picked from another session; each load reads the
		// server at once, then holds its answer until the test lets it go
		await openColours(page);
		await changeElsewhere(page, { kind: "pick", hex: "#7A2E2E" });
		let fetched = () => {};
		const read = new Promise<void>((resolve) => {
			fetched = resolve;
		});
		let release = () => {};
		const held = new Promise<void>((resolve) => {
			release = resolve;
		});
		await page.route("/api/dress", async (route) => {
			const response = await route.fetch();
			fetched();
			await held;
			await route.fulfill({ response });
		});
		// When
		await focusTab(page);
		await read;
		const stored = changeStored(page);
		await square(page, "Sweater #E6DFD0").click();
		await stored;
		const answered = page.waitForResponse((r) =>
			isDressGet(r.url(), r.request().method()),
		);
		release();
		await answered;
		await twoFrames(page);
		// Then
		expect({
			beige: await square(page, "Sweater #E6DFD0").getAttribute("aria-pressed"),
			red: await square(page, "Sweater #7A2E2E").getAttribute("aria-pressed"),
		}).toEqual({ beige: "true", red: "false" });
	});

	test("keeps the newest load when an older one answers last", async ({
		page,
	}) => {
		// Given: both projects, a fresh account, the Colours tab on the phone;
		// the first load reads the server at once, then holds its answer until
		// the test lets it go; later loads pass
		await openColours(page);
		let fetched = () => {};
		const read = new Promise<void>((resolve) => {
			fetched = resolve;
		});
		let release = () => {};
		const held = new Promise<void>((resolve) => {
			release = resolve;
		});
		let loads = 0;
		await page.route("/api/dress", async (route) => {
			if (loads++ > 0) return route.continue();
			const response = await route.fetch();
			fetched();
			await held;
			await route.fulfill({ response });
		});
		// When
		await focusTab(page);
		await read;
		await changeElsewhere(page, { kind: "pick", hex: "#7A2E2E" });
		const second = page.waitForResponse((r) =>
			isDressGet(r.url(), r.request().method()),
		);
		const checked = sessionChecked(page);
		await focusTab(page);
		await second;
		await checked;
		const first = page.waitForResponse((r) =>
			isDressGet(r.url(), r.request().method()),
		);
		release();
		await first;
		await twoFrames(page);
		// Then
		expect({
			red: await square(page, "Sweater #7A2E2E").getAttribute("aria-pressed"),
			navy: await square(page, "Sweater #1F3A5F").getAttribute("aria-pressed"),
		}).toEqual({ red: "true", navy: "false" });
	});

	test("keeps each account's colours when another account signs in from a second tab", async ({
		page,
	}) => {
		// Given: both projects, a fresh account, the Colours tab on the phone;
		// Sweater #7A2E2E picked and stored; then the browser holds a second
		// account's session, and each session check waits until the page has
		// read the load of the same focus
		await openColours(page);
		const stored = changeStored(page);
		await square(page, "Sweater #7A2E2E").click();
		await stored;
		const first = await page.context().storageState();
		const other = JSON.parse(readFileSync(claimAccount(), "utf8"));
		let loaded: Promise<unknown> = Promise.resolve();
		await page.route("/api/me", async (route) => {
			await loaded;
			await twoFrames(page);
			await route.continue();
		});
		// The page is rebuilt for each account (src/react-app/shell/SessionGate.tsx),
		// so a tab picked before the switch is no longer picked after it.
		const phone = (page.viewportSize()?.width ?? 0) < 900;
		const marker = page.getByRole("tab", {
			name: phone ? "Colours" : "Hot",
			exact: true,
		});
		const markSwitch = async () => {
			if (!phone) await marker.click();
			await expect(marker).toHaveAttribute("aria-selected", "true");
		};
		const showColours = async () => {
			await expect(marker).toHaveAttribute("aria-selected", "false");
			if (phone) await marker.click();
		};
		await markSwitch();
		await page.context().clearCookies();
		await page.context().addCookies(other.cookies);
		loaded = page.waitForResponse((r) =>
			isDressGet(r.url(), r.request().method()),
		);
		await focusTab(page);
		await showColours();
		await expect(square(page, "Sweater #1F3A5F")).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		// When: the first account signs in again, with no reload
		await markSwitch();
		await page.context().clearCookies();
		await page.context().addCookies(first.cookies);
		loaded = page.waitForResponse((r) =>
			isDressGet(r.url(), r.request().method()),
		);
		const checked = sessionChecked(page);
		await focusTab(page);
		await checked;
		await showColours();
		// Then
		await expect(square(page, "Sweater #7A2E2E")).toHaveAttribute(
			"aria-pressed",
			"true",
		);
	});
});
