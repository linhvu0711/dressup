import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

// Each look is stored in order, so the wall shows the last name first.
async function seedLooks(page: Page, names: string[]) {
	for (const name of names) {
		const res = await page.request.post("/api/looks", {
			data: {
				id: crypto.randomUUID(),
				modeId: "polo-sweater",
				name,
				colours: { chino_p: "#C9B38C", polo_l: "#F3F1EC", sweater: "#1F3A5F" },
				open: [],
			},
		});
		expect(res.status()).toBe(201);
	}
}

async function openLooks(page: Page, names: string[]) {
	await seedLooks(page, names);
	await page.goto("/looks");
	await expect(page.locator('[data-slot="look-card"]')).toHaveCount(
		names.length,
	);
}

const scaleButton = (page: Page) =>
	page.getByRole("button", { name: "Compare", exact: true });

const cardButton = (page: Page, name: string) =>
	page.getByRole("button", { name, exact: true });

const pressedOf = (page: Page, name: string) =>
	cardButton(page, name).getAttribute("aria-pressed");

const h1 = (page: Page) => page.locator("h1").textContent();

test("ticks and unticks a card in the pick state", async ({ page }) => {
	// Given: both projects, looks "Look 1" and "Look 2", /looks open
	await openLooks(page, ["Look 1", "Look 2"]);
	// When
	await scaleButton(page).click();
	await cardButton(page, "Look 1").click();
	await expect(page.locator("h1")).toHaveText("1 picked");
	// Then
	expect({
		h1: await h1(page),
		note: await page.getByText("Pick 2 to 6").isVisible(),
		look1: await pressedOf(page, "Look 1"),
		look2: await pressedOf(page, "Look 2"),
	}).toEqual({ h1: "1 picked", note: true, look1: "true", look2: "false" });
	// When
	await cardButton(page, "Look 1").click();
	await expect(page.locator("h1")).toHaveText("0 picked");
	// Then
	expect({
		h1: await h1(page),
		look1: await pressedOf(page, "Look 1"),
	}).toEqual({ h1: "0 picked", look1: "false" });
});

test("ends the pick state with the x", async ({ page }) => {
	// Given: both projects, looks "Look 1" and "Look 2", "Compare" clicked
	// and "Look 1" ticked
	await openLooks(page, ["Look 1", "Look 2"]);
	await scaleButton(page).click();
	await cardButton(page, "Look 1").click();
	await expect(page.locator("h1")).toHaveText("1 picked");
	// When
	await page.getByRole("button", { name: "Stop picking" }).click();
	await expect(page.locator("h1")).toHaveText("Looks");
	// Then
	expect({
		h1: await h1(page),
		pressed: await page.locator("[aria-pressed]").count(),
		scale: await scaleButton(page).isVisible(),
	}).toEqual({ h1: "Looks", pressed: 0, scale: true });
	// When
	await scaleButton(page).click();
	await expect(page.locator("h1")).toHaveText("0 picked");
	// Then
	expect({
		h1: await h1(page),
		look1: await pressedOf(page, "Look 1"),
	}).toEqual({ h1: "0 picked", look1: "false" });
});

test("has no scale button on an empty wall", async ({ page }) => {
	// Given: both projects, a fresh account with no looks, /looks open
	await page.goto("/looks");
	// When
	await expect(
		page.getByRole("heading", { name: "No looks yet" }),
	).toBeVisible();
	// Then
	await expect(scaleButton(page)).toHaveCount(0);
});

const compareButton = (page: Page) =>
	page.getByRole("button", { name: /^Compare \d$/ });

async function compareState(page: Page) {
	const button = compareButton(page);
	return {
		name: await button.textContent(),
		enabled: await button.isEnabled(),
	};
}

test("turns Compare on from two picks", async ({ page }) => {
	// Given: both projects, looks "Look 1" and "Look 2", "Compare" clicked
	await openLooks(page, ["Look 1", "Look 2"]);
	await scaleButton(page).click();
	// When
	const states = [await compareState(page)];
	for (const name of ["Look 1", "Look 2"]) {
		await cardButton(page, name).click();
		await expect(cardButton(page, name)).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		states.push(await compareState(page));
	}
	// Then
	expect(states).toEqual([
		{ name: "Compare 0", enabled: false },
		{ name: "Compare 1", enabled: false },
		{ name: "Compare 2", enabled: true },
	]);
});

test("keeps Compare off with one look", async ({ page }) => {
	// Given: both projects, "Look 1" alone, /looks open
	await openLooks(page, ["Look 1"]);
	// When
	await scaleButton(page).click();
	await cardButton(page, "Look 1").click();
	await expect(page.locator("h1")).toHaveText("1 picked");
	// Then
	const state = await compareState(page);
	expect({
		h1: await h1(page),
		look1: await pressedOf(page, "Look 1"),
		compare: state.name,
		enabled: state.enabled,
	}).toEqual({
		h1: "1 picked",
		look1: "true",
		compare: "Compare 1",
		enabled: false,
	});
});

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 0) < 900;

const compareLooks = (page: Page) => page.locator('[data-slot="compare-look"]');

async function pickAndCompare(page: Page, names: string[]) {
	await scaleButton(page).click();
	for (const name of names) await cardButton(page, name).click();
	await page
		.getByRole("button", { name: `Compare ${names.length}`, exact: true })
		.click();
	await expect(compareLooks(page)).toHaveCount(names.length);
}

test("opens the picked looks in one row", async ({ page }) => {
	// Given: both projects, "Look 1" to "Look 3" (wall order 3, 2, 1),
	// "Compare" clicked
	await openLooks(page, ["Look 1", "Look 2", "Look 3"]);
	// When
	await pickAndCompare(page, ["Look 3", "Look 1", "Look 2"]);
	// Then
	const height = page.viewportSize()?.height ?? 0;
	const boxes = await Promise.all(
		(await compareLooks(page).all()).map((look) => look.boundingBox()),
	);
	const figures = await Promise.all(
		(await compareLooks(page).locator("svg").all()).map((svg) =>
			svg.boundingBox(),
		),
	);
	expect({
		url: new URL(page.url()).pathname,
		h1: await h1(page),
		names: await compareLooks(page).allTextContents(),
		oneRow: boxes.every((box) => box?.y === boxes[0]?.y),
		wholeHeight: figures.map(
			(box) => !!box && box.y >= 0 && box.y + box.height <= height,
		),
	}).toEqual({
		url: "/looks/compare",
		h1: "Compare",
		names: ["Look 3", "Look 1", "Look 2"],
		oneRow: true,
		wholeHeight: [true, true, true],
	});
});

async function wholeInView(page: Page) {
	const whole = [];
	for (const look of await compareLooks(page).all())
		whole.push(
			await look.evaluate((el) => {
				const box = el.getBoundingClientRect();
				return (
					box.left >= 0 &&
					box.right <= window.innerWidth &&
					box.top >= 0 &&
					box.bottom <= window.innerHeight
				);
			}),
		);
	return whole;
}

test("shows two and a part on a phone and six from 900 px", async ({
	page,
}) => {
	if (isPhone(page)) {
		// Given: phone, "Look 1" to "Look 3" picked, the compare view open
		await openLooks(page, ["Look 1", "Look 2", "Look 3"]);
		await pickAndCompare(page, ["Look 3", "Look 1", "Look 2"]);
		// When
		const whole = await wholeInView(page);
		const third = compareLooks(page).nth(2);
		const thirdShows = await third.evaluate(
			(el) => el.getBoundingClientRect().left < window.innerWidth,
		);
		await page
			.locator('[data-slot="compare-row"]')
			.evaluate((el) => el.scrollTo({ left: el.scrollWidth }));
		await expect(third).toBeInViewport({ ratio: 1 });
		// Then
		expect({
			whole,
			thirdShows,
			thirdAfterScroll: (await wholeInView(page))[2],
		}).toEqual({
			whole: [true, true, false],
			thirdShows: true,
			thirdAfterScroll: true,
		});
	} else {
		// Given: laptop, "Look 1" to "Look 6" picked, the compare view open
		const names = ["Look 1", "Look 2", "Look 3", "Look 4", "Look 5", "Look 6"];
		await openLooks(page, names);
		await pickAndCompare(page, names);
		// When
		const row = page.locator('[data-slot="compare-row"]');
		// Then
		expect({
			whole: await wholeInView(page),
			scrolls: await row.evaluate((el) => el.scrollWidth > el.clientWidth),
		}).toEqual({
			whole: [true, true, true, true, true, true],
			scrolls: false,
		});
	}
});

test("goes back to the wall", async ({ page }) => {
	// Given: both projects, "Look 1" to "Look 3" picked, the compare view open
	await openLooks(page, ["Look 1", "Look 2", "Look 3"]);
	await pickAndCompare(page, ["Look 3", "Look 1", "Look 2"]);
	// When
	await page.getByRole("link", { name: "Back" }).click();
	await expect(page.locator("h1")).toHaveText("Looks");
	// Then
	expect({
		url: new URL(page.url()).pathname,
		h1: await h1(page),
		pressed: await page.locator("[aria-pressed]").count(),
		cards: await page.locator('[data-slot="look-card"]').count(),
	}).toEqual({ url: "/looks", h1: "Looks", pressed: 0, cards: 3 });
});

test("goes to the wall when the compare view has no picks", async ({
	page,
}) => {
	// Given: both projects, "Look 1" to "Look 3" stored, no pick made
	await seedLooks(page, ["Look 1", "Look 2", "Look 3"]);
	// When
	await page.goto("/looks/compare");
	await expect(page).toHaveURL("/looks");
	// Then
	expect({
		url: new URL(page.url()).pathname,
		h1: await h1(page),
	}).toEqual({ url: "/looks", h1: "Looks" });
});
