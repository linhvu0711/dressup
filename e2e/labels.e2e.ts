import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { COLOURS_EMPTY_FILE, COLOURS_FULL_FILE } from "./global-setup";

const STARTER = [
	"White #F4F2ED",
	"Black #1B1B1F",
	"Navy #1F3A5F",
	"Charcoal #3A3F47",
	"Grey #8C8A84",
	"Beige #D9CBB0",
	"Khaki #B8A57C",
	"Olive #6A6B3C",
	"Light blue #BFD3EA",
	"Brown #7A5638",
	"Cream #EDE4CF",
	"Burgundy #6E1F2F",
	"Mustard #C9962B",
];

const rows = (page: Page) =>
	page.locator('[data-slot="colour-list"]').getByRole("button");

const rowNames = (page: Page) =>
	rows(page).evaluateAll((buttons) =>
		buttons.map((b) => b.getAttribute("aria-label")),
	);

test("opens the Labels page from the main bar", async ({ page }) => {
	// Given: a fresh account, / open
	await page.goto("/");
	// When
	await page
		.getByRole("navigation", { name: "Main" })
		.getByRole("link", { name: "Labels" })
		.click();
	// Then
	await expect(page.getByRole("heading", { level: 1 })).toHaveText("Labels");
	expect({
		url: new URL(page.url()).pathname,
		add: await page.getByRole("button", { name: "Add a colour" }).isVisible(),
	}).toEqual({ url: "/labels", add: true });
});

test("lists the starter colours with swatch, name, and code", async ({
	page,
}) => {
	// Given: a fresh account
	// When
	await page.goto("/labels");
	// Then
	await expect(rows(page)).toHaveCount(13);
	expect({
		names: await rowNames(page),
		swatch: await page
			.locator('[data-slot="colour-swatch"]')
			.first()
			.evaluate((el) => getComputedStyle(el).backgroundColor),
	}).toEqual({ names: STARTER, swatch: "rgb(244, 242, 237)" });
});

const sheet = (page: Page, name = "Add a colour") =>
	page.getByRole("dialog", { name });

const nameBox = (page: Page) =>
	page.getByRole("dialog").getByRole("textbox", { name: "Name" });

const codeBox = (page: Page) =>
	page.getByRole("dialog").getByRole("textbox", { name: "Colour code" });

async function openAdd(page: Page) {
	await page.goto("/labels");
	await expect(rows(page)).toHaveCount(13);
	await page.getByRole("button", { name: "Add a colour" }).click();
}

test("adds a colour with the + form", async ({ page }) => {
	// Given: a fresh account, /labels open
	await openAdd(page);
	// When
	await nameBox(page).fill("Teal");
	await codeBox(page).fill("#2A7F7F");
	await sheet(page).getByRole("button", { name: "Add", exact: true }).click();
	// Then
	await expect(page.locator('[data-slot="toast"]')).toHaveText("Colour added");
	await expect(rows(page)).toHaveCount(14);
	expect({
		dialogs: await page.getByRole("dialog").count(),
		last: (await rowNames(page)).at(-1),
	}).toEqual({ dialogs: 0, last: "Teal #2A7F7F" });
});

test("asks for a name and sends nothing", async ({ page }) => {
	// Given: a fresh account, the add form open with the name left empty
	let posts = 0;
	page.on("request", (r) => {
		if (r.method() === "POST" && r.url().endsWith("/api/colours")) posts++;
	});
	await openAdd(page);
	// When
	await sheet(page).getByRole("button", { name: "Add", exact: true }).click();
	// Then
	await expect(sheet(page).getByRole("alert")).toHaveText("Enter a name.");
	expect(posts).toBe(0);
});

test("says a taken name is taken, in any case", async ({ page }) => {
	// Given: a fresh account, the add form open with the name "navy"
	await openAdd(page);
	await nameBox(page).fill("navy");
	// When
	await sheet(page).getByRole("button", { name: "Add", exact: true }).click();
	// Then
	await expect(sheet(page).getByRole("alert")).toHaveText(
		"You have this colour already.",
	);
	// The open sheet hides the page from roles, so the rows are counted as items.
	await expect(page.locator('[data-slot="colour-list"] li')).toHaveCount(13);
});

test("keeps the name to 24 characters", async ({ page }) => {
	// Given: a fresh account, the add form open
	await openAdd(page);
	// When
	await nameBox(page).pressSequentially("Navy blue for long coats and jackets");
	// Then
	await expect(nameBox(page)).toHaveValue("Navy blue for long coats");
});

test("keeps the form open with Not saved when Add fails", async ({ page }) => {
	// Given: a fresh account, the add form open with "Teal"; the add answers 500
	await openAdd(page);
	await nameBox(page).fill("Teal");
	await page.route("**/api/colours", (route) =>
		route.request().method() === "POST"
			? route.fulfill({ status: 500 })
			: route.fallback(),
	);
	// When
	await sheet(page).getByRole("button", { name: "Add", exact: true }).click();
	// Then
	await expect(sheet(page).getByRole("alert")).toHaveText(
		"Not saved. Try again.",
	);
	await expect(nameBox(page)).toHaveValue("Teal");
});

test.describe("an account with 100 colours", () => {
	test.use({ storageState: COLOURS_FULL_FILE });

	test("turns Add off at 100 colours", async ({ page }) => {
		// Given: the account with 100 colours, /labels open
		await page.goto("/labels");
		await expect(rows(page)).toHaveCount(100);
		// When
		await page.getByRole("button", { name: "Add a colour" }).click();
		// Then
		await expect(sheet(page).getByRole("alert")).toHaveText(
			"You have 100 colours. That is the limit. Delete one to add a new one.",
		);
		await expect(
			sheet(page).getByRole("button", { name: "Add", exact: true }),
		).toBeDisabled();
	});
});

test("changes a colour's name and code", async ({ page }) => {
	// Given: a fresh account, /labels open
	await page.goto("/labels");
	await expect(rows(page)).toHaveCount(13);
	// When
	await page.getByRole("button", { name: "Navy #1F3A5F" }).click();
	await expect(nameBox(page)).toHaveValue("Navy");
	await expect(codeBox(page)).toHaveValue("#1F3A5F");
	await nameBox(page).fill("Ink");
	await codeBox(page).fill("#22304A");
	await sheet(page, "Edit colour")
		.getByRole("button", { name: "Save", exact: true })
		.click();
	// Then
	await expect(page.locator('[data-slot="toast"]')).toHaveText("Changes saved");
	await expect(rows(page).nth(2)).toHaveAccessibleName("Ink #22304A");
});

async function openNavy(page: Page) {
	await page.goto("/labels");
	await expect(rows(page)).toHaveCount(13);
	await page.getByRole("button", { name: "Navy #1F3A5F" }).click();
}

test("swaps the form to the confirm step and back", async ({ page }) => {
	// Given: a fresh account, the row "Navy #1F3A5F" open
	await openNavy(page);
	// When
	await sheet(page, "Edit colour")
		.getByRole("button", { name: "Delete" })
		.click();
	const confirm = {
		dialogs: await page.getByRole("dialog").count(),
		title: await page.getByRole("dialog").getByRole("heading").textContent(),
	};
	await page.getByRole("button", { name: "Back" }).click();
	// Then
	expect({
		confirm,
		dialogs: await page.getByRole("dialog").count(),
		title: await page.getByRole("dialog").getByRole("heading").textContent(),
		name: await nameBox(page).inputValue(),
	}).toEqual({
		confirm: { dialogs: 1, title: 'Delete the colour "Navy"?' },
		dialogs: 1,
		title: "Edit colour",
		name: "Navy",
	});
});

test("deletes a colour from the confirm step", async ({ page }) => {
	// Given: a fresh account, the row "Navy #1F3A5F" open
	await openNavy(page);
	// When
	await sheet(page, "Edit colour")
		.getByRole("button", { name: "Delete" })
		.click();
	await page
		.getByRole("dialog")
		.getByRole("button", { name: "Delete" })
		.click();
	// Then
	await expect(page.locator('[data-slot="toast"]')).toHaveText(
		"Colour deleted",
	);
	await expect(rows(page)).toHaveCount(12);
	expect(await rowNames(page)).not.toContain("Navy #1F3A5F");
});

test.describe("an account with no colours", () => {
	test.use({ storageState: COLOURS_EMPTY_FILE });

	test("shows No colours yet for an emptied list", async ({ page }) => {
		// Given: the account whose colours were all deleted
		// When
		await page.goto("/labels");
		// Then
		await expect(
			page.getByRole("heading", { name: "No colours yet" }),
		).toBeVisible();
		await expect(
			page.getByText("Tap + to add your first colour."),
		).toBeVisible();
		await expect(rows(page)).toHaveCount(0);
	});
});
