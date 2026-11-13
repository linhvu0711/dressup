import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import {
	card,
	isPhone,
	openColours,
	openDress,
	saveLook,
	storedLooks,
} from "./looks-helpers";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

const panel = (page: Page) => page.locator('[data-slot="look-panel"]');

const confirm = (page: Page) =>
	page.getByRole("alertdialog", { name: "Delete this look?" });

const names = async (page: Page) =>
	(await storedLooks(page)).looks.map((l) => l.name);

async function twoLooksNavyOpen(page: Page) {
	await openDress(page);
	await saveLook(page, "Navy day");
	await saveLook(page, "Keep");
	await openLook(page, "Navy day");
}

const sweater = (page: Page) =>
	page.locator(
		'svg[aria-label="Mannequin in Polo + sweater"] [data-garment="sweater"]',
	);

async function pickColour(page: Page, name: string) {
	// The page sends changes from a queue; leaving before the 204 can cut
	// the change off.
	const stored = page.waitForResponse(
		(res) => res.url().endsWith("/api/dress/changes") && res.status() === 204,
	);
	await page.getByRole("button", { name, exact: true }).click();
	await stored;
}

async function goTo(page: Page, name: "Dress" | "Looks") {
	await page
		.getByRole("link", { name, exact: true })
		.filter({ visible: true })
		.click();
}

// "Navy day" saved in a red sweater, then a navy sweater on, then the look
// opened from the wall and its pencil clicked.
async function editRedNavyDay(page: Page) {
	await openColours(page);
	await pickColour(page, "Sweater #7A2E2E");
	await saveLook(page, "Navy day");
	await pickColour(page, "Sweater #1F3A5F");
	await goTo(page, "Looks");
	await card(page, "Navy day").click();
	await page.getByRole("button", { name: "Edit this look" }).click();
}

const toast = (page: Page) => page.locator('[data-slot="toast"]');

async function openLook(page: Page, name: string) {
	await page.goto("/looks");
	await card(page, name).click();
	await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
}

test("opens a look as a page under 900 px and beside the wall from 900 px", async ({
	page,
}) => {
	// Given: both projects, a fresh account; a look "Navy day" saved, then /looks
	await openDress(page);
	await saveLook(page, "Navy day");
	await page.goto("/looks");
	const { looks } = await storedLooks(page);
	const wall = page.locator('[data-slot="look-wall"]');
	// When
	await card(page, "Navy day").click();
	// Then
	if (isPhone(page)) {
		await expect(page).toHaveURL(`/looks/${looks[0].id}`);
		await expect(page.getByRole("link", { name: "Back" })).toBeVisible();
		await expect(wall).toBeHidden();
		await page.getByRole("link", { name: "Back" }).click();
		await expect(page).toHaveURL("/looks");
		await expect(wall).toBeVisible();
	} else {
		await expect(page).toHaveURL(`/looks/${looks[0].id}`);
		await expect(wall).toBeVisible();
		await expect(card(page, "Navy day")).toHaveAttribute(
			"aria-current",
			"true",
		);
		await expect(
			panel(page).getByRole("heading", { name: "Navy day" }),
		).toBeVisible();
	}
});

test("shows the look's mannequin, name, and garment lines", async ({
	page,
}) => {
	// Given: both projects, a fresh account; a red sweater saved with no name
	await openColours(page);
	await page
		.getByRole("button", { name: "Sweater #7A2E2E", exact: true })
		.click();
	await saveLook(page, "");
	// When
	await openLook(page, "Polo + sweater");
	// Then
	await expect(
		page.locator('[data-slot="look-view"] [data-slot="garment-line"]'),
	).toHaveText(["Sweater#7A2E2E", "Long polo#F3F1EC", "Chino pants#C9B38C"]);
	expect(
		await page
			.locator('svg[aria-label="Polo + sweater"] [data-garment="sweater"]')
			.innerHTML(),
	).toContain('fill="#7A2E2E"');
});

test("shows the newest look before a pick from 900 px", async ({ page }) => {
	test.skip(isPhone(page), "the right part shows from 900 px");
	// Given: laptop, a fresh account; looks "Older" then "Newer" saved
	await openDress(page);
	await saveLook(page, "Older");
	await saveLook(page, "Newer");
	// When
	await page.goto("/looks");
	// Then
	await expect(
		panel(page).getByRole("heading", { name: "Newer" }),
	).toBeVisible();
	await expect(card(page, "Newer")).toHaveAttribute("aria-current", "true");
	await expect(card(page, "Older")).not.toHaveAttribute("aria-current");
});

test("shows the wall for a link to a look it does not have", async ({
	page,
}) => {
	// Given: both projects, a fresh account; a look "Navy day" saved
	await openDress(page);
	await saveLook(page, "Navy day");
	// When
	await page.goto("/looks/00000000-0000-4000-8000-000000000000");
	// Then
	await expect(card(page, "Navy day")).toBeVisible();
	await expect(page.getByRole("link", { name: "Back" })).toBeHidden();
	await expect(toast(page)).toHaveCount(0);
});

test("copies a code and shows the toast", async ({ page }) => {
	// Given: both projects, a fresh account; a look "Navy day" from the
	// starter colours, open
	await openDress(page);
	await saveLook(page, "Navy day");
	await openLook(page, "Navy day");
	// When
	await page
		.locator('[data-slot="look-view"]')
		.getByRole("button", { name: "Copy #1F3A5F" })
		.click();
	// Then
	await expect(toast(page)).toHaveText("#1F3A5F copied");
	expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
		"#1F3A5F",
	);
});

test("deletes a look", async ({ page }) => {
	// Given: both projects, looks "Navy day" then "Keep"; "Navy day" open
	await twoLooksNavyOpen(page);
	// When
	await page.getByRole("button", { name: "Delete this look" }).click();
	await expect(confirm(page)).toContainText(
		'"Navy day" goes away for good. Your colour squares stay.',
	);
	await confirm(page).getByRole("button", { name: "Delete" }).click();
	// Then
	await expect(toast(page)).toHaveText("Look deleted");
	await expect(page).toHaveURL("/looks");
	await expect(page.locator('[data-slot="look-card"]')).toHaveText(["Keep"]);
	expect(await names(page)).toEqual(["Keep"]);
});

test("deletes the only look and shows No looks yet", async ({ page }) => {
	// Given: both projects, one look "Navy day", open
	await openDress(page);
	await saveLook(page, "Navy day");
	await openLook(page, "Navy day");
	// When
	await page.getByRole("button", { name: "Delete this look" }).click();
	await confirm(page).getByRole("button", { name: "Delete" }).click();
	// Then
	await expect(toast(page)).toHaveText("Look deleted");
	await expect(page).toHaveURL("/looks");
	await expect(
		page.getByRole("heading", { name: "No looks yet" }),
	).toBeVisible();
	expect(await storedLooks(page)).toEqual({ looks: [] });
});

test("keeps the look on Cancel and Esc", async ({ page }) => {
	// Given: both projects, looks "Navy day" then "Keep"; "Navy day" open
	await twoLooksNavyOpen(page);
	// When
	await page.getByRole("button", { name: "Delete this look" }).click();
	await confirm(page).getByRole("button", { name: "Cancel" }).click();
	await expect(confirm(page)).toHaveCount(0);
	await page.getByRole("button", { name: "Delete this look" }).click();
	await expect(confirm(page)).toBeVisible();
	await page.keyboard.press("Escape");
	// Then
	await expect(confirm(page)).toHaveCount(0);
	await expect(
		page.getByRole("heading", { name: "Navy day", exact: true }),
	).toBeVisible();
	expect(await names(page)).toEqual(["Keep", "Navy day"]);
	await expect(toast(page)).toHaveCount(0);
});

test("keeps the look when the delete fails", async ({ page }) => {
	// Given: both projects, "Navy day" open; a DELETE answers 500
	await twoLooksNavyOpen(page);
	await page.route("**/api/looks/*", (route) =>
		route.request().method() === "DELETE"
			? route.fulfill({ status: 500 })
			: route.continue(),
	);
	// When
	await page.getByRole("button", { name: "Delete this look" }).click();
	await confirm(page).getByRole("button", { name: "Delete" }).click();
	// Then
	await expect(toast(page)).toHaveText("Not deleted. Try again.");
	await expect(
		page.getByRole("heading", { name: "Navy day", exact: true }),
	).toBeVisible();
	await expect(confirm(page)).toHaveCount(0);
	expect(await names(page)).toEqual(["Keep", "Navy day"]);
});

test("shows the wall when the look to delete is gone", async ({ page }) => {
	// Given: both projects, "Navy day" open; then a second device deletes it
	await twoLooksNavyOpen(page);
	const gone = (await storedLooks(page)).looks.find(
		(l) => l.name === "Navy day",
	);
	await page.request.delete(`/api/looks/${gone?.id}`);
	// When
	await page.getByRole("button", { name: "Delete this look" }).click();
	await confirm(page).getByRole("button", { name: "Delete" }).click();
	// Then
	await expect(toast(page)).toHaveText("This look is gone");
	await expect(page).toHaveURL("/looks");
	await expect(page.locator('[data-slot="look-card"]')).toHaveText(["Keep"]);
});

test("opens the look on the Dress page in the edit state", async ({ page }) => {
	// Given: both projects, "Navy day" saved red, a navy sweater on, the look open
	// When
	await editRedNavyDay(page);
	// Then
	await expect(page).toHaveURL("/");
	await expect(page.getByText("Editing: Navy day")).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Stop editing" }),
	).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Save changes" }),
	).toBeVisible();
	await expect(page.getByRole("button", { name: "Save look" })).toHaveCount(0);
	await expect
		.poll(() => sweater(page).innerHTML())
		.toContain('fill="#7A2E2E"');
});

test("ends the edit state with the cross", async ({ page }) => {
	// Given: both projects, "Navy day" in the edit state over a navy sweater
	await editRedNavyDay(page);
	await expect(page.getByText("Editing: Navy day")).toBeVisible();
	// When
	await page.getByRole("button", { name: "Stop editing" }).click();
	// Then
	await expect(page.getByText("Editing:")).toHaveCount(0);
	await expect(page.getByRole("button", { name: "Save look" })).toBeVisible();
	expect(await sweater(page).innerHTML()).toContain('fill="#1F3A5F"');
	await expect
		.poll(
			async () =>
				(
					(await (await page.request.get("/api/dress")).json()) as {
						picked: Record<string, string>;
					}
				).picked.sweater,
		)
		.toBe("#1F3A5F");
});

test("shows the whole cross for a long name on a phone", async ({ page }) => {
	test.skip(!isPhone(page), "the stage is narrow under 900 px");
	// Given: phone, a look named with 60 W's, open
	await openDress(page);
	const name = "W".repeat(60);
	await saveLook(page, name);
	await page.goto("/looks");
	await card(page, name).click();
	// When
	await page.getByRole("button", { name: "Edit this look" }).click();
	// Then
	const cross = await page
		.getByRole("button", { name: "Stop editing" })
		.boundingBox();
	const save = await page
		.getByRole("button", { name: "Save changes" })
		.boundingBox();
	expect({
		leftOfSave: (cross?.x ?? 0) + (cross?.width ?? 0) <= (save?.x ?? 0),
		inside: (cross?.x ?? 0) + (cross?.width ?? 0) <= 375,
	}).toEqual({ leftOfSave: true, inside: true });
});
