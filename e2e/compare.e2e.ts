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
