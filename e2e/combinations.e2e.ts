import type { Page } from "@playwright/test";
import {
	colourIds,
	pick,
	postCombinations,
	swatch,
	three,
	two,
	typeChip,
} from "./combination-helpers";
import { expect, test } from "./fixtures";
import { COMBINATIONS_FULL_FILE } from "./global-setup";
import { isPhone } from "./looks-helpers";

const LONG_TITLE =
	"Khaki Harrington jacket (open) + Black long tee + Navy casual pants";

const cards = (page: Page) => page.locator('[data-slot="combination-card"]');

const mainNav = (page: Page) => page.getByRole("navigation", { name: "Main" });

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

const failMannequin = (page: Page) =>
	page.route("/api/mannequin", (route) => route.fulfill({ status: 500 }));

// The answer of the first GET /api/mannequin, so a test reads the page after
// the mannequin failed, not before.
const mannequinAnswered = (page: Page) =>
	page.waitForResponse((res) => res.url().endsWith("/api/mannequin"));

test("says Could not load your mannequin on the wall and loads on Try again", async ({
	page,
}) => {
	// Given: both projects, two saved combinations, GET /api/mannequin answers 500
	// until the retry
	const ids = await colourIds(page);
	await postCombinations(page, three(ids), two(ids));
	await failMannequin(page);
	// When
	await page.goto("/combinations");
	// Then
	await expect(page.getByRole("alert")).toHaveText(
		"Could not load your mannequin.",
	);
	await expect(cards(page)).toHaveCount(0);
	await page.unroute("/api/mannequin");
	// When
	await page.getByRole("button", { name: "Try again" }).click();
	// Then
	await expect(cards(page)).toHaveCount(2);
	await expect(page.getByRole("alert")).toHaveCount(0);
});

test("shows No combinations yet when the mannequin fails and nothing is saved", async ({
	page,
}) => {
	// Given: both projects, no combinations, GET /api/mannequin answers 500
	await failMannequin(page);
	// When
	const answered = mannequinAnswered(page);
	await page.goto("/combinations");
	await answered;
	// Then
	await expect(
		page.getByRole("heading", { name: "No combinations yet" }),
	).toBeVisible();
	await expect(page.getByText("Could not load your mannequin.")).toHaveCount(0);
});

test("shows Could not load your combinations when the mannequin fails too", async ({
	page,
}) => {
	// Given: both projects, GET /api/mannequin and GET /api/combinations answer 500
	await failMannequin(page);
	await page.route("**/api/combinations", (route) =>
		route.fulfill({ status: 500 }),
	);
	// When
	const answered = mannequinAnswered(page);
	await page.goto("/combinations");
	await answered;
	// Then
	await expect(
		page.getByRole("heading", { name: "Could not load your combinations" }),
	).toBeVisible();
	await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
	await expect(page.getByText("Could not load your mannequin.")).toHaveCount(0);
});

test("shows grey cards and no alert while the mannequin loads", async ({
	page,
}) => {
	// Given: both projects, one saved combination, GET /api/mannequin held until
	// the test lets it go
	await postCombinations(page, two(await colourIds(page)));
	let release = () => {};
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	await page.route("/api/mannequin", async (route) => {
		await held;
		await route.continue();
	});
	// When
	await page.goto("/combinations");
	// Then
	const loading = cards(page).locator('svg[aria-label="Loading"]');
	await expect(loading).toHaveCount(1);
	await expect(page.getByRole("alert")).toHaveCount(0);
	release();
	await expect(loading).toHaveCount(0);
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

const toast = (page: Page) => page.locator('[data-slot="toast"]');

const view = (page: Page) => page.locator('[data-slot="combination-view"]');

const viewTitle = (page: Page) => view(page).locator("h2");

// THREE saved, then the address of its own page.
async function savedThree(page: Page) {
	await page.goto("/");
	const saved = three(await colourIds(page));
	await postCombinations(page, saved);
	return saved;
}

test("opens a combination as a page under 900 px and beside the wall from 900 px", async ({
	page,
}) => {
	// Given: both projects, a fresh account with THREE saved, /combinations
	const saved = await savedThree(page);
	await page.goto("/combinations");
	const wall = page.locator('[data-slot="combination-wall"]');
	// When
	await cards(page).first().click();
	// Then
	await expect(page).toHaveURL(`/combinations/${saved.id}`);
	await expect(
		page.getByRole("link", { name: "Change this combination" }),
	).toHaveAttribute("href", `/build/${saved.id}`);
	await expect(
		page.getByRole("button", { name: "Delete this combination" }),
	).toBeVisible();
	if (isPhone(page)) {
		await expect(page.getByRole("link", { name: "Back" })).toBeVisible();
		await expect(wall).toBeHidden();
		await page.getByRole("link", { name: "Back" }).click();
		await expect(page).toHaveURL("/combinations");
		await expect(wall).toBeVisible();
	} else {
		await expect(wall).toBeVisible();
		await expect(cards(page).first()).toHaveAttribute("aria-current", "true");
		await expect(page.getByRole("link", { name: "Back" })).toBeHidden();
		// Beside the wall the head row sits under the stage.
		const [h, s] = [
			await viewTitle(page).boundingBox(),
			await view(page).locator('[data-surface="wall"]').boundingBox(),
		];
		expect(h && s && s.y + s.height <= h.y).toBe(true);
	}
});

test("shows the mannequin, the whole title, and a line for each piece", async ({
	page,
}) => {
	// Given: both projects, a fresh account with THREE saved
	const saved = await savedThree(page);
	// When
	await page.goto(`/combinations/${saved.id}`);
	// Then
	await expect(viewTitle(page)).toHaveText(LONG_TITLE);
	const box = await viewTitle(page).evaluate((el) => ({
		lines: el.clientHeight / Number.parseFloat(getComputedStyle(el).lineHeight),
		cut: el.scrollWidth > el.clientWidth,
		wider:
			document.documentElement.scrollWidth >
			document.documentElement.clientWidth,
	}));
	expect({
		wraps: isPhone(page) ? box.lines > 1.5 : true,
		cut: box.cut,
		wider: box.wider,
	}).toEqual({ wraps: true, cut: false, wider: false });
	await expect(page.getByRole("img", { name: LONG_TITLE })).toBeVisible();
	await expect(page.locator('[data-slot="piece-line"]')).toHaveText([
		"Khaki Harrington jacket · open#B8A57C",
		"Black long tee#1B1B1F",
		"Navy casual pants#1F3A5F",
	]);
});

test.describe("copy", () => {
	test.use({ permissions: ["clipboard-read", "clipboard-write"] });

	test("copies a colour code and shows the toast", async ({ page }) => {
		// Given: both projects, a fresh account with THREE saved and open
		const saved = await savedThree(page);
		await page.goto(`/combinations/${saved.id}`);
		// When
		await view(page).getByRole("button", { name: "Copy #1F3A5F" }).click();
		// Then
		await expect(toast(page)).toHaveText("#1F3A5F copied");
		expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
			"#1F3A5F",
		);
	});
});

test("shows the wall for a link to a combination it does not have", async ({
	page,
}) => {
	// Given: both projects, a fresh account with THREE saved
	await savedThree(page);
	// When
	await page.goto("/combinations/00000000-0000-4000-8000-000000000000");
	// Then
	await expect(cards(page)).toHaveCount(1);
	await expect(cards(page).first()).toBeVisible();
	await expect(view(page)).toHaveCount(0);
	await expect(toast(page)).toHaveCount(0);
});

test("shows skeleton cards while a combination's address loads", async ({
	page,
}) => {
	// Given: both projects, THREE saved; GET /api/combinations held until the
	// test lets it go
	const saved = await savedThree(page);
	let release = () => {};
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	await page.route("**/api/combinations", async (route) => {
		await held;
		await route.continue();
	});
	// When
	await page.goto(`/combinations/${saved.id}`);
	// Then
	const skeletons = page.locator('[data-slot="combination-skeleton"]');
	await expect(skeletons).toHaveCount(6);
	await expect(skeletons.first()).toBeVisible();
	release();
	await expect(skeletons).toHaveCount(0);
	await expect(viewTitle(page)).toHaveText(LONG_TITLE);
});

test("shows Could not load your combinations for a combination's address", async ({
	page,
}) => {
	// Given: both projects, THREE saved; the first GET /api/combinations
	// answers 500
	const saved = await savedThree(page);
	let failed = false;
	await page.route("**/api/combinations", (route) => {
		if (failed) return route.continue();
		failed = true;
		return route.fulfill({ status: 500 });
	});
	// When
	await page.goto(`/combinations/${saved.id}`);
	// Then
	await expect(
		page.getByRole("heading", { name: "Could not load your combinations" }),
	).toBeVisible();
	await page.getByRole("button", { name: "Retry" }).click();
	await expect(viewTitle(page)).toHaveText(LONG_TITLE);
});

test("says Could not load your mannequin on a combination's page and loads on Try again", async ({
	page,
}) => {
	// Given: both projects, THREE saved, GET /api/mannequin answers 500 until the
	// retry
	const first = three(await colourIds(page));
	await postCombinations(page, first);
	await failMannequin(page);
	// When
	await page.goto(`/combinations/${first.id}`);
	// Then
	await expect(view(page).getByRole("alert")).toHaveText(
		"Could not load your mannequin.",
	);
	await expect(viewTitle(page)).toHaveText(LONG_TITLE);
	await page.unroute("/api/mannequin");
	// When
	await view(page).getByRole("button", { name: "Try again" }).click();
	// Then
	await expect(view(page).getByRole("img", { name: LONG_TITLE })).toBeVisible();
	await expect(view(page).getByRole("alert")).toHaveCount(0);
});

test("shows the sign-in screen when a combination's address answers 401", async ({
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
	await page.goto("/combinations/00000000-0000-4000-8000-000000000000");
	// Then
	await expect(
		page.getByRole("button", { name: "Sign in with Google" }),
	).toBeVisible();
});

const confirm = (page: Page) =>
	page.getByRole("alertdialog", { name: "Delete this combination?" });

const titles = (page: Page) => page.locator('[data-slot="combination-title"]');

// THREE, then TWO saved; THREE's own page open.
async function threeOpenBesideTwo(page: Page) {
	await page.goto("/");
	const ids = await colourIds(page);
	const first = three(ids);
	const second = two(ids);
	await postCombinations(page, first, second);
	await page.goto(`/combinations/${first.id}`);
	await expect(viewTitle(page)).toHaveText(LONG_TITLE);
	return { first, second };
}

test("deletes a combination", async ({ page }) => {
	// Given: both projects, THREE then TWO saved; THREE open
	await threeOpenBesideTwo(page);
	// When
	await page.getByRole("button", { name: "Delete this combination" }).click();
	await expect(confirm(page)).toContainText(
		`"${LONG_TITLE}" goes away for good. Your colours stay.`,
	);
	await confirm(page).getByRole("button", { name: "Delete" }).click();
	// Then
	await expect(toast(page)).toHaveText("Combination deleted");
	await expect(page).toHaveURL("/combinations");
	await expect(titles(page)).toHaveText([
		"White short tee + Grey training shorts",
	]);
});

test("keeps the combination on Cancel", async ({ page }) => {
	// Given: both projects, THREE then TWO saved; THREE open
	await threeOpenBesideTwo(page);
	// When
	await page.getByRole("button", { name: "Delete this combination" }).click();
	await confirm(page).getByRole("button", { name: "Cancel" }).click();
	// Then
	await expect(confirm(page)).toHaveCount(0);
	await expect(viewTitle(page)).toHaveText(LONG_TITLE);
	await expect(toast(page)).toHaveCount(0);
});

test("keeps the combination when the delete fails", async ({ page }) => {
	// Given: both projects, THREE open; a DELETE answers 500
	await threeOpenBesideTwo(page);
	await page.route("**/api/combinations/*", (route) =>
		route.request().method() === "DELETE"
			? route.fulfill({ status: 500 })
			: route.continue(),
	);
	// When
	await page.getByRole("button", { name: "Delete this combination" }).click();
	await confirm(page).getByRole("button", { name: "Delete" }).click();
	// Then
	await expect(toast(page)).toHaveText("Not deleted. Try again.");
	await expect(confirm(page)).toHaveCount(0);
	await expect(viewTitle(page)).toHaveText(LONG_TITLE);
});

test("shows the wall when the combination to delete is gone", async ({
	page,
}) => {
	// Given: both projects, THREE open; then a second device deletes it
	const { first } = await threeOpenBesideTwo(page);
	await page.request.delete(`/api/combinations/${first.id}`);
	// When
	await page.getByRole("button", { name: "Delete this combination" }).click();
	await confirm(page).getByRole("button", { name: "Delete" }).click();
	// Then
	await expect(toast(page)).toHaveText("This combination is gone");
	await expect(page).toHaveURL("/combinations");
	await expect(titles(page)).toHaveText([
		"White short tee + Grey training shorts",
	]);
});

const stage = (page: Page) => page.locator('[data-slot="build-stage"]');

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

test("says Could not load your mannequin in the builder and loads on Try again", async ({
	page,
}) => {
	// Given: both projects, GET /api/mannequin answers 500 until the retry
	await failMannequin(page);
	await page.goto("/build");
	await expect(stage(page).getByRole("alert")).toHaveText(
		"Could not load your mannequin.",
	);
	await page.unroute("/api/mannequin");
	// When
	await stage(page).getByRole("button", { name: "Try again" }).click();
	// Then
	await expect(
		stage(page).locator('svg[aria-label="Mannequin in the combination"]'),
	).toBeVisible();
	await expect(stage(page).getByRole("alert")).toHaveCount(0);
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

// The account's combinations as the API lists them.
async function stored(page: Page) {
	const res = await page.request.get("/api/combinations");
	return (
		(await res.json()) as {
			combinations: {
				id: string;
				pieces: { typeId: string; colour: { name: string } }[];
			}[];
		}
	).combinations;
}

const changeButton = (page: Page) =>
	page.getByRole("link", { name: "Change this combination" });

test("changes a combination in the builder", async ({ page }) => {
	// Given: both projects, THREE then TWO saved; THREE open
	const { first, second } = await threeOpenBesideTwo(page);
	// When
	await changeButton(page).click();
	// Then
	await expect(page).toHaveURL(`/build/${first.id}`);
	await expect(
		page.getByRole("heading", { name: "Change combination" }),
	).toBeVisible();
	await expect(
		stage(page).locator('[data-garment="harrington"]'),
	).toHaveAttribute("data-front", "open");
	await expect(
		stage(page).locator('[data-garment="casual_p"] [fill="#1F3A5F"]').first(),
	).toBeAttached();
	// When
	await pick(page, "Bottom", "Casual pants", "Grey");
	await page.getByRole("button", { name: "Save" }).click();
	// Then
	await expect(
		saveDialog(page).getByRole("button", { name: "Save changes" }),
	).toBeVisible();
	// When
	await saveDialog(page).getByRole("button", { name: "Save changes" }).click();
	// Then
	await expect(toast(page)).toHaveText("Changes saved");
	await expect(page).toHaveURL(`/combinations/${first.id}`);
	await expect(viewTitle(page)).toHaveText(
		"Khaki Harrington jacket (open) + Black long tee + Grey casual pants",
	);
	expect((await stored(page)).map((c) => c.id)).toEqual([second.id, first.id]);
});

test("keeps the saved pieces in the builder when the colours do not load", async ({
	page,
}) => {
	// Given: both projects, THREE then TWO saved; THREE open; the colours
	// answer 500, so the builder has no colour list of its own
	await threeOpenBesideTwo(page);
	await page.route("**/api/colours", (route) =>
		route.request().method() === "GET"
			? route.fulfill({ status: 500 })
			: route.fallback(),
	);
	// When
	await changeButton(page).click();
	// Then
	await expect(
		stage(page).locator('[data-garment="casual_p"] [fill="#1F3A5F"]').first(),
	).toBeAttached();
	await expect(page.getByText("Pick 2 pieces or more")).toHaveCount(0);
	await expect(page.getByRole("button", { name: "Save" })).toBeEnabled();
});

test("refuses a change into a combination the account has", async ({
	page,
}) => {
	// Given: both projects, THREE then TWO saved; THREE open
	const { second } = await threeOpenBesideTwo(page);
	// When
	await changeButton(page).click();
	await page.getByRole("tab", { name: "Jacket", exact: true }).click();
	await typeChip(page, "None").click();
	await pick(page, "Bottom", "Training shorts", "Grey");
	await pick(page, "Inner top", "Short tee", "White");
	await page.getByRole("button", { name: "Save" }).click();
	// Then
	await expect(saveDialog(page).getByRole("alert")).toHaveText(
		"You have this combination already.",
	);
	await expect(
		saveDialog(page).getByRole("button", { name: "Save changes" }),
	).toBeDisabled();
	await expect(
		saveDialog(page).getByRole("link", { name: "Open it" }),
	).toHaveAttribute("href", `/combinations/${second.id}`);
});

test("shows the duplicate hint when the change answers duplicate", async ({
	page,
}) => {
	// Given: both projects, THREE saved and open; a PUT answers duplicate
	const saved = await savedThree(page);
	const other = crypto.randomUUID();
	await page.route("**/api/combinations/*", (route) =>
		route.request().method() === "PUT"
			? route.fulfill({ status: 409, json: { error: "duplicate", id: other } })
			: route.continue(),
	);
	await page.goto(`/combinations/${saved.id}`);
	// When
	await changeButton(page).click();
	await pick(page, "Bottom", "Casual pants", "Grey");
	await page.getByRole("button", { name: "Save" }).click();
	await saveDialog(page).getByRole("button", { name: "Save changes" }).click();
	// Then
	await expect(saveDialog(page).getByRole("alert")).toHaveText(
		"You have this combination already.",
	);
	await expect(
		saveDialog(page).getByRole("link", { name: "Open it" }),
	).toHaveAttribute("href", `/combinations/${other}`);
});

test("leaves the combination as it was when the builder closes", async ({
	page,
}) => {
	// Given: both projects, THREE then TWO saved; THREE open
	const { first } = await threeOpenBesideTwo(page);
	// When
	await changeButton(page).click();
	await pick(page, "Bottom", "Casual pants", "Grey");
	await page.getByRole("link", { name: "Close", exact: true }).click();
	// Then
	await expect(page).toHaveURL(`/combinations/${first.id}`);
	await expect(viewTitle(page)).toHaveText(LONG_TITLE);
	const kept = (await stored(page)).find((c) => c.id === first.id);
	expect(kept?.pieces.map((p) => [p.typeId, p.colour.name])).toEqual([
		["casual_p", "Navy"],
		["tee_l", "Black"],
		["harrington", "Khaki"],
	]);
});

test("shows the wall when the changed combination is gone", async ({
	page,
}) => {
	// Given: both projects, THREE then TWO saved; the builder open on THREE;
	// a second device deletes it just before the change reaches the server.
	// A delete before the save form opens would send the builder to the wall
	// on the form's list refetch, with no change to send.
	const { first } = await threeOpenBesideTwo(page);
	await changeButton(page).click();
	await expect(
		page.getByRole("heading", { name: "Change combination" }),
	).toBeVisible();
	await page.route(`**/api/combinations/${first.id}`, async (route) => {
		if (route.request().method() === "PUT")
			await page.request.delete(`/api/combinations/${first.id}`);
		await route.continue();
	});
	// When
	await pick(page, "Bottom", "Casual pants", "Grey");
	await page.getByRole("button", { name: "Save" }).click();
	await saveDialog(page).getByRole("button", { name: "Save changes" }).click();
	// Then
	await expect(toast(page)).toHaveText("This combination is gone");
	await expect(page).toHaveURL("/combinations");
	await expect(titles(page)).toHaveText([
		"White short tee + Grey training shorts",
	]);
});

test("says Could not load your combinations in the builder and loads on Retry", async ({
	page,
}) => {
	// Given: both projects, THREE saved; the first GET /api/combinations
	// answers 500
	const saved = await savedThree(page);
	let failed = false;
	await page.route("**/api/combinations", (route) => {
		if (failed) return route.continue();
		failed = true;
		return route.fulfill({ status: 500 });
	});
	// When
	await page.goto(`/build/${saved.id}`);
	// Then
	await expect(
		page.getByRole("heading", { name: "Could not load your combinations" }),
	).toBeVisible();
	// When
	await page.getByRole("button", { name: "Retry" }).click();
	// Then
	await expect(
		page.getByRole("heading", { name: "Change combination" }),
	).toBeVisible();
	await expect(
		stage(page).locator('[data-garment="harrington"]'),
	).toHaveAttribute("data-front", "open");
});
