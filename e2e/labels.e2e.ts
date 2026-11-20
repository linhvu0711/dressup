import type { Page } from "@playwright/test";
import { postOwnedItems } from "./closet-helpers";
import { postCombinations } from "./combination-helpers";
import { expect, test } from "./fixtures";
import { colourIds } from "./label-helpers";
import { sheet, toast } from "./locators";
import { COLOURS_EMPTY_FILE, COLOURS_FULL_FILE } from "./paths";
import { postWish } from "./wishlist-helpers";

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

const addSheet = (page: Page) => sheet(page, "Add a colour");

const nameBox = (page: Page) =>
	sheet(page).getByRole("textbox", { name: "Name" });

const codeBox = (page: Page) =>
	sheet(page).getByRole("textbox", { name: "Colour code" });

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
	await addSheet(page)
		.getByRole("button", { name: "Add", exact: true })
		.click();
	// Then
	await expect(toast(page)).toHaveText("Colour added");
	await expect(rows(page)).toHaveCount(14);
	expect({
		dialogs: await sheet(page).count(),
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
	await addSheet(page)
		.getByRole("button", { name: "Add", exact: true })
		.click();
	// Then
	await expect(addSheet(page).getByRole("alert")).toHaveText("Enter a name.");
	expect(posts).toBe(0);
});

test("says a taken name is taken, in any case", async ({ page }) => {
	// Given: a fresh account, the add form open with the name "navy"
	await openAdd(page);
	await nameBox(page).fill("navy");
	// When
	await addSheet(page)
		.getByRole("button", { name: "Add", exact: true })
		.click();
	// Then
	await expect(addSheet(page).getByRole("alert")).toHaveText(
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
	await addSheet(page)
		.getByRole("button", { name: "Add", exact: true })
		.click();
	// Then
	await expect(addSheet(page).getByRole("alert")).toHaveText(
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
		await expect(addSheet(page).getByRole("alert")).toHaveText(
			"You have 100 colours. That is the limit. Delete one to add a new one.",
		);
		await expect(
			addSheet(page).getByRole("button", { name: "Add", exact: true }),
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
	await expect(toast(page)).toHaveText("Changes saved");
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
		dialogs: await sheet(page).count(),
		title: await sheet(page).getByRole("heading").textContent(),
	};
	await page.getByRole("button", { name: "Back" }).click();
	// Then
	expect({
		confirm,
		dialogs: await sheet(page).count(),
		title: await sheet(page).getByRole("heading").textContent(),
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
	await sheet(page).getByRole("button", { name: "Delete" }).click();
	// Then
	await expect(toast(page)).toHaveText("Colour deleted");
	await expect(rows(page)).toHaveCount(12);
	expect(await rowNames(page)).not.toContain("Navy #1F3A5F");
});

test("says a colour in a combination is in use and offers no Delete", async ({
	page,
}) => {
	// Given: a fresh account with a combination of Navy casual pants and a
	// White long tee, the row "Navy #1F3A5F" open
	const ids = await colourIds(page);
	await postCombinations(page, {
		id: crypto.randomUUID(),
		pieces: [
			{ typeId: "casual_p", colourId: ids.Navy },
			{ typeId: "tee_l", colourId: ids.White },
		],
	});
	await openNavy(page);
	// When
	await sheet(page, "Edit colour")
		.getByRole("button", { name: "Delete" })
		.click();
	// Then
	const dialog = sheet(page);
	await expect(
		dialog.getByText(
			"A combination, an item in your closet, or a wish uses this colour, so you cannot delete it.",
		),
	).toBeVisible();
	await expect(dialog.getByRole("button", { name: "Delete" })).toHaveCount(0);
	await expect(dialog.getByRole("button", { name: "Back" })).toBeVisible();
});

test("says an item in the closet keeps a colour", async ({ page }) => {
	// Given: a fresh account with a Navy long button-up in the closet; the
	// row "Navy #1F3A5F" open
	await page.goto("/labels");
	const ids = await colourIds(page);
	await postOwnedItems(page, {
		typeId: "shirt_l",
		colourId: ids.Navy,
		brandId: null,
		quantity: 1,
	});
	await openNavy(page);
	// When
	await sheet(page, "Edit colour")
		.getByRole("button", { name: "Delete" })
		.click();
	// Then
	const dialog = sheet(page);
	await expect(
		dialog.getByText(
			"A combination, an item in your closet, or a wish uses this colour, so you cannot delete it.",
		),
	).toBeVisible();
	await expect(dialog.getByRole("button", { name: "Delete" })).toHaveCount(0);
});

test("says a colour is in use when the delete answers colour_in_use", async ({
	page,
}) => {
	// Given: a fresh account; the delete answered 409 colour_in_use; the row
	// "Navy #1F3A5F" open
	await page.route("**/api/colours/*", (route) =>
		route.request().method() === "DELETE"
			? route.fulfill({ status: 409, json: { error: "colour_in_use" } })
			: route.continue(),
	);
	await openNavy(page);
	// When
	await sheet(page, "Edit colour")
		.getByRole("button", { name: "Delete" })
		.click();
	await sheet(page).getByRole("button", { name: "Delete" }).click();
	// Then
	const dialog = sheet(page);
	await expect(
		dialog.getByText(
			"A combination, an item in your closet, or a wish uses this colour, so you cannot delete it.",
		),
	).toBeVisible();
	await expect(dialog.getByRole("button", { name: "Delete" })).toHaveCount(0);
	await expect(dialog.getByText("Not deleted. Try again.")).toHaveCount(0);
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

test("shows skeleton rows while the colours load", async ({ page }) => {
	// Given: a fresh account; GET /api/colours held until the test lets it go
	let release = () => {};
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	await page.route("**/api/colours", async (route) => {
		await held;
		await route.continue();
	});
	// When
	await page.goto("/labels");
	// Then
	const loading = page.locator('[data-slot="colour-list-loading"] li');
	await expect(loading).toHaveCount(6);
	release();
	await expect(rows(page)).toHaveCount(13);
	await expect(loading).toHaveCount(0);
});

test("shows Could not load your colours and loads on Retry", async ({
	page,
}) => {
	// Given: a fresh account; the first GET /api/colours answers 500
	let calls = 0;
	await page.route("**/api/colours", (route) =>
		calls++ === 0 ? route.fulfill({ status: 500 }) : route.continue(),
	);
	// When
	await page.goto("/labels");
	await expect(
		page.getByRole("heading", { name: "Could not load your colours" }),
	).toBeVisible();
	await page.getByRole("button", { name: "Retry" }).click();
	// Then
	await expect(rows(page)).toHaveCount(13);
});

test("shows the sign-in screen when the colours answer 401", async ({
	page,
}) => {
	// Given: a page with no data of its own open, and its session check
	// passed; then the session is gone for the session check and for the
	// colours. Not /, whose wall loads the colours, or /settings, whose
	// requests can land after the 401 is in place and sign out too early.
	await page.goto("/nope");
	await expect(
		page.getByRole("navigation", { name: "Main" }).getByRole("link", {
			name: "Labels",
		}),
	).toBeVisible();
	const noSession = { status: 401, json: { error: "unauthorized" } };
	await page.route("/api/me", (route) => route.fulfill(noSession));
	await page.route("**/api/colours", (route) => route.fulfill(noSession));
	// When
	await page
		.getByRole("navigation", { name: "Main" })
		.getByRole("link", { name: "Labels" })
		.click();
	// Then
	await expect(
		page.getByRole("button", { name: "Sign in with Google" }),
	).toBeVisible();
});

test("refuses to delete a colour a wish uses", async ({ page }) => {
	// Given: a fresh account with an Olive long polo wish and nothing else in
	// Olive
	await page.goto("/labels");
	const ids = await colourIds(page);
	await postWish(page, { typeId: "polo_l", colourId: ids.Olive });
	await page.goto("/labels");
	await expect(rows(page)).toHaveCount(13);
	// When
	await page.getByRole("button", { name: "Olive #6A6B3C" }).click();
	await sheet(page, "Edit colour")
		.getByRole("button", { name: "Delete" })
		.click();
	// Then
	const dialog = sheet(page);
	await expect(
		dialog.getByText(
			"A combination, an item in your closet, or a wish uses this colour, so you cannot delete it.",
		),
	).toBeVisible();
	await expect(dialog.getByRole("button", { name: "Delete" })).toHaveCount(0);
});
