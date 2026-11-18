import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

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
