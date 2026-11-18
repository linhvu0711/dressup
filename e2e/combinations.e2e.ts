import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { COMBINATIONS_FULL_FILE } from "./global-setup";
import { isPhone } from "./looks-helpers";

const LONG_TITLE =
	"Khaki Harrington jacket (open) + Black long tee + Navy casual pants";

const cards = (page: Page) => page.locator('[data-slot="combination-card"]');

const mainNav = (page: Page) => page.getByRole("navigation", { name: "Main" });

// The account's colour ids by name, through its own session.
async function colourIds(page: Page): Promise<Record<string, string>> {
	const res = await page.request.get("/api/colours");
	const { colours } = (await res.json()) as {
		colours: { id: string; name: string }[];
	};
	return Object.fromEntries(colours.map((c) => [c.name, c.id]));
}

// Every e2e account shares one database, so each saved combination gets its
// own id.
// Khaki Harrington jacket (open) + Black long tee + Navy casual pants.
const three = (ids: Record<string, string>) => ({
	id: crypto.randomUUID(),
	pieces: [
		{ typeId: "harrington", colourId: ids.Khaki },
		{ typeId: "tee_l", colourId: ids.Black },
		{ typeId: "casual_p", colourId: ids.Navy },
	],
	open: true,
});

// White short tee + Grey training shorts.
const two = (ids: Record<string, string>) => ({
	id: crypto.randomUUID(),
	pieces: [
		{ typeId: "train_sh", colourId: ids.Grey },
		{ typeId: "tee_s", colourId: ids.White },
	],
	open: false,
});

async function postCombinations(page: Page, ...bodies: unknown[]) {
	for (const body of bodies) {
		const res = await page.request.post("/api/combinations", { data: body });
		expect(res.status()).toBe(201);
	}
}

test("opens the wall from the Combinations tab", async ({ page }) => {
	// Given: both projects, a fresh account, the Dress page open
	await page.goto("/");
	// When
	await mainNav(page).getByRole("link", { name: "Combinations" }).click();
	// Then
	await expect(page).toHaveURL("/combinations");
	await expect(
		page.getByRole("heading", { name: "No combinations yet" }),
	).toBeVisible();
});

test("shows No combinations yet with a button to the builder", async ({
	page,
}) => {
	// Given: both projects, a fresh account
	// When
	await page.goto("/combinations");
	// Then
	await expect(
		page.getByRole("heading", { name: "No combinations yet" }),
	).toBeVisible();
	await expect(
		page.getByText(
			"Pick 2 to 4 pieces on the mannequin. Your combinations come here.",
		),
	).toBeVisible();
	await expect(
		page.getByRole("link", { name: "Build a combination" }),
	).toHaveAttribute("href", "/build");
});

test("shows the saved combinations newest first with their titles", async ({
	page,
}) => {
	// Given: both projects, a fresh account with THREE, then TWO saved
	await page.goto("/");
	const ids = await colourIds(page);
	await postCombinations(page, three(ids), two(ids));
	// When
	await page.goto("/combinations");
	// Then
	const titles = cards(page).locator('[data-slot="combination-title"]');
	await expect(titles).toHaveText([
		"White short tee + Grey training shorts",
		LONG_TITLE,
	]);
	await expect(cards(page).nth(0).locator("svg")).toHaveCount(1);
	await expect(cards(page).nth(1).locator("svg")).toHaveCount(1);
	const box = await titles.nth(1).evaluate((el) => ({
		lines: el.clientHeight / Number.parseFloat(getComputedStyle(el).lineHeight),
		cut: el.scrollHeight > el.clientHeight,
	}));
	expect({ twoLinesAtMost: box.lines <= 2.05, cut: box.cut }).toEqual({
		twoLinesAtMost: true,
		cut: true,
	});
});

test("marks the combination the address names", async ({ page }) => {
	// Given: both projects, a fresh account with THREE and TWO saved
	await page.goto("/");
	const ids = await colourIds(page);
	const first = three(ids);
	await postCombinations(page, first, two(ids));
	// When
	await page.goto(`/combinations/${first.id}`);
	// Then
	await expect(cards(page).nth(1)).toHaveAttribute("aria-current", "true");
	await expect(cards(page).nth(0)).not.toHaveAttribute("aria-current");
});

test("shows skeleton cards while the combinations load", async ({ page }) => {
	// Given: GET /api/combinations held until the test lets it go
	let release = () => {};
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	await page.route("**/api/combinations", async (route) => {
		await held;
		await route.continue();
	});
	// When
	await page.goto("/combinations");
	// Then
	await expect(page.locator('[data-slot="combination-skeleton"]')).toHaveCount(
		6,
	);
	release();
	await expect(page.locator('[data-slot="combination-skeleton"]')).toHaveCount(
		0,
	);
	await expect(
		page.getByRole("heading", { name: "No combinations yet" }),
	).toBeVisible();
});

test("shows Could not load your combinations and loads on Retry", async ({
	page,
}) => {
	// Given: the first GET /api/combinations answered 500, the next passed on
	let failed = false;
	await page.route("**/api/combinations", (route) => {
		if (failed) return route.continue();
		failed = true;
		return route.fulfill({ status: 500 });
	});
	// When
	await page.goto("/combinations");
	// Then
	await expect(
		page.getByRole("heading", { name: "Could not load your combinations" }),
	).toBeVisible();
	// When
	await page.getByRole("button", { name: "Retry" }).click();
	// Then
	await expect(
		page.getByRole("heading", { name: "No combinations yet" }),
	).toBeVisible();
});

test("shows the sign-in screen when the combinations answer 401", async ({
	page,
}) => {
	// Given: both projects, / open; then the session is gone for the session
	// check and for the combinations
	await page.goto("/");
	await expect(mainNav(page)).toBeVisible();
	const noSession = { status: 401, json: { error: "unauthorized" } };
	await page.route("/api/me", (route) => route.fulfill(noSession));
	await page.route("**/api/combinations", (route) => route.fulfill(noSession));
	// When
	await mainNav(page).getByRole("link", { name: "Combinations" }).click();
	// Then
	await expect(
		page.getByRole("button", { name: "Sign in with Google" }),
	).toBeVisible();
});

const stage = (page: Page) => page.locator('[data-slot="build-stage"]');

const typeChip = (page: Page, name: string) =>
	page
		.getByRole("radiogroup", { name: "Type" })
		.getByRole("radio", { name, exact: true });

const swatch = (page: Page, name: string) =>
	page
		.getByRole("radiogroup", { name: "Colour" })
		.getByRole("radio", { name, exact: true });

// Picks a type in a layer, then a colour.
async function pick(page: Page, layer: string, type: string, colour: string) {
	await page.getByRole("tab", { name: layer, exact: true }).click();
	await typeChip(page, type).click();
	await swatch(page, colour).click();
}

test("opens the builder from the header +", async ({ page }) => {
	// Given: both projects, a fresh account, /combinations open
	await page.goto("/combinations");
	// When
	await page.getByRole("link", { name: "New combination" }).click();
	// Then
	await expect(page).toHaveURL("/build");
	await expect(
		page.getByRole("heading", { name: "New combination" }),
	).toBeVisible();
	await expect(page.getByRole("tab")).toHaveText([
		"Bottom",
		"Inner top",
		"Sweater",
		"Jacket",
	]);
	const chips = page
		.getByRole("radiogroup", { name: "Type" })
		.getByRole("radio");
	await expect(chips).toHaveText([
		"None",
		"Chino shorts",
		"Chino pants",
		"Casual shorts",
		"Casual pants",
		"Training shorts",
		"Training pants",
	]);
	for (let i = 1; i < 7; i++)
		await expect(chips.nth(i).locator("svg")).toHaveCount(1);
	await expect(page.getByRole("radiogroup", { name: "Colour" })).toHaveCount(0);
});

test("wears pale blank pieces with no bottom and no top", async ({ page }) => {
	// Given: both projects, a fresh account
	// When
	await page.goto("/build");
	// Then
	await expect(
		stage(page).locator('[data-garment="casual_p"] [fill="#E2DED7"]').first(),
	).toBeAttached();
	await expect(
		stage(page).locator('[data-garment="tee_s"] [fill="#E2DED7"]').first(),
	).toBeAttached();
	await expect(page.getByRole("button", { name: "Save" })).toBeDisabled();
});

test("puts a picked piece on the mannequin at once", async ({ page }) => {
	// Given: both projects, /build
	await page.goto("/build");
	// When
	await typeChip(page, "Casual pants").click();
	await swatch(page, "Navy").click();
	// Then
	await expect(
		stage(page).locator('[data-garment="casual_p"] [fill="#1F3A5F"]').first(),
	).toBeAttached();
	await expect(
		stage(page).locator('[data-garment="casual_p"] [fill="#E2DED7"]'),
	).toHaveCount(0);
});

test("replaces a piece in the same layer and takes it off", async ({
	page,
}) => {
	// Given: both projects, /build, Navy casual pants picked
	await page.goto("/build");
	await typeChip(page, "Casual pants").click();
	await swatch(page, "Navy").click();
	// When
	await typeChip(page, "Chino pants").click();
	// Then
	await expect(
		stage(page).locator('[data-garment="chino_p"] [fill="#1F3A5F"]').first(),
	).toBeAttached();
	await expect(stage(page).locator('[data-garment="casual_p"]')).toHaveCount(0);
	// When
	await typeChip(page, "None").click();
	// Then
	await expect(
		stage(page).locator('[data-garment="casual_p"] [fill="#E2DED7"]').first(),
	).toBeAttached();
	await expect(stage(page).locator('[data-garment="chino_p"]')).toHaveCount(0);
});

test("starts a jacket open and closes it", async ({ page }) => {
	// Given: both projects, /build, the Jacket tab
	await page.goto("/build");
	await page.getByRole("tab", { name: "Jacket" }).click();
	// When
	await typeChip(page, "Harrington jacket").click();
	// Then
	const front = page.getByRole("radiogroup", { name: "Jacket front" });
	await expect(
		stage(page).locator('[data-garment="harrington"]'),
	).toHaveAttribute("data-front", "open");
	await expect(front.getByRole("radio", { name: "Open" })).toBeChecked();
	// When
	await front.getByRole("radio", { name: "Closed" }).click();
	// Then
	await expect(
		stage(page).locator('[data-garment="harrington"]'),
	).toHaveAttribute("data-front", "closed");
});

test("keeps the layer tabs in view when the picker scrolls", async ({
	page,
}) => {
	test.skip(!isPhone(page), "phone layout only");
	// Given: phone, /build, an inner top picked, so the picker is taller than
	// its space
	await page.goto("/build");
	await page.getByRole("tab", { name: "Inner top", exact: true }).click();
	await typeChip(page, "Long tee").click();
	const panel = page.getByRole("tabpanel");
	// When
	await panel.evaluate((el) => el.scrollTo(0, el.scrollHeight));
	// Then
	expect(await panel.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
	await expect(page.getByRole("tablist", { name: "Layer" })).toBeInViewport({
		ratio: 1,
	});
	await expect(swatch(page, "Mustard")).toBeInViewport();
});

test("turns Save on at 2 pieces", async ({ page }) => {
	// Given: both projects, /build
	await page.goto("/build");
	const save = page.getByRole("button", { name: "Save" });
	// When
	await typeChip(page, "Casual pants").click();
	// Then
	await expect(save).toBeDisabled();
	// When
	await pick(page, "Inner top", "Long tee", "Black");
	// Then
	await expect(save).toBeEnabled();
});

const saveDialog = (page: Page) =>
	page.getByRole("dialog", { name: "Save combination" });

const LIMIT_TEXT =
	"You have 300 combinations. That is the limit. Delete one to save a new one.";

// The three pieces of THREE, picked in the builder.
async function pickThree(page: Page) {
	await pick(page, "Bottom", "Casual pants", "Navy");
	await pick(page, "Inner top", "Long tee", "Black");
	await pick(page, "Jacket", "Harrington jacket", "Khaki");
}

// Navy casual pants and a Black long tee, then Save in the header.
async function pickTwoAndOpenSave(page: Page) {
	await page.goto("/build");
	await pick(page, "Bottom", "Casual pants", "Navy");
	await pick(page, "Inner top", "Long tee", "Black");
	await page.getByRole("button", { name: "Save" }).click();
}

test("saves a combination and opens the wall", async ({ page }) => {
	// Given: both projects, a fresh account, /build
	await page.goto("/build");
	// When
	await pickThree(page);
	await page.getByRole("button", { name: "Save" }).click();
	// Then
	await expect(saveDialog(page)).toContainText(LONG_TITLE);
	// When
	await saveDialog(page).getByRole("button", { name: "Save" }).click();
	// Then
	await expect(page).toHaveURL("/combinations");
	await expect(page.locator('[data-slot="toast"]')).toHaveText(
		"Saved to Combinations",
	);
	await expect(page.locator('[data-slot="combination-title"]')).toHaveText([
		LONG_TITLE,
	]);
});

test("says the account has this combination and opens it", async ({ page }) => {
	// Given: both projects, a fresh account with THREE saved
	await page.goto("/build");
	const saved = three(await colourIds(page));
	await postCombinations(page, saved);
	await page.reload();
	// When
	await pickThree(page);
	await page.getByRole("button", { name: "Save" }).click();
	// Then
	await expect(saveDialog(page).getByRole("alert")).toHaveText(
		"You have this combination already.",
	);
	await expect(
		saveDialog(page).getByRole("button", { name: "Save" }),
	).toBeDisabled();
	// When
	await saveDialog(page).getByRole("link", { name: "Open it" }).click();
	// Then
	await expect(page).toHaveURL(`/combinations/${saved.id}`);
	await expect(cards(page).first()).toHaveAttribute("aria-current", "true");
});

test("shows the duplicate hint when the save answers duplicate", async ({
	page,
}) => {
	// Given: both projects, a fresh account; the save answers duplicate
	const other = crypto.randomUUID();
	await page.route("**/api/combinations", (route) =>
		route.request().method() === "POST"
			? route.fulfill({
					status: 409,
					json: { error: "duplicate", id: other },
				})
			: route.continue(),
	);
	// When
	await pickTwoAndOpenSave(page);
	await saveDialog(page).getByRole("button", { name: "Save" }).click();
	// Then
	await expect(saveDialog(page).getByRole("alert")).toHaveText(
		"You have this combination already.",
	);
	await expect(
		saveDialog(page).getByRole("link", { name: "Open it" }),
	).toHaveAttribute("href", `/combinations/${other}`);
});

test.describe("at the combination limit", () => {
	test.use({ storageState: COMBINATIONS_FULL_FILE });

	test("turns Save off and shows the limit hint at 300 combinations", async ({
		page,
	}) => {
		// Given: both projects, the account with 300 combinations
		// When
		await pickTwoAndOpenSave(page);
		// Then
		await expect(saveDialog(page).getByRole("alert")).toHaveText(LIMIT_TEXT);
		await expect(
			saveDialog(page).getByRole("button", { name: "Save" }),
		).toBeDisabled();
		await expect(
			saveDialog(page).getByRole("button", { name: "Cancel" }),
		).toBeEnabled();
	});
});

test("shows the limit hint when the save answers combination_limit", async ({
	page,
}) => {
	// Given: both projects, a fresh account; the save answers the limit
	await page.route("**/api/combinations", (route) =>
		route.request().method() === "POST"
			? route.fulfill({ status: 409, json: { error: "combination_limit" } })
			: route.continue(),
	);
	// When
	await pickTwoAndOpenSave(page);
	await saveDialog(page).getByRole("button", { name: "Save" }).click();
	// Then
	await expect(saveDialog(page).getByRole("alert")).toHaveText(LIMIT_TEXT);
	await expect(
		saveDialog(page).getByRole("button", { name: "Save" }),
	).toBeDisabled();
});

test("keeps the form open with Not saved when the save fails", async ({
	page,
}) => {
	// Given: both projects, a fresh account; the save answers 500
	await page.route("**/api/combinations", (route) =>
		route.request().method() === "POST"
			? route.fulfill({ status: 500 })
			: route.continue(),
	);
	// When
	await pickTwoAndOpenSave(page);
	await saveDialog(page).getByRole("button", { name: "Save" }).click();
	// Then
	await expect(saveDialog(page).getByRole("alert")).toHaveText(
		"Not saved. Try again.",
	);
});

test("shows a colour's new name on its combination", async ({ page }) => {
	// Given: a fresh account with the three-piece combination
	await page.goto("/labels");
	await postCombinations(page, three(await colourIds(page)));
	// When
	await page.getByRole("button", { name: "Khaki #B8A57C" }).click();
	const sheet = page.getByRole("dialog", { name: "Edit colour" });
	await sheet.getByLabel("Name").fill("Sand");
	await sheet.getByRole("button", { name: "Save", exact: true }).click();
	await expect(sheet).toHaveCount(0);
	await mainNav(page).getByRole("link", { name: "Combinations" }).click();
	// Then
	await expect(
		cards(page).first().locator('[data-slot="combination-title"]'),
	).toHaveText(/^Sand Harrington jacket \(open\)/);
});
