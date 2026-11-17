import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { LIMIT_FILE } from "./global-setup";
import {
	card,
	dialog,
	isPhone,
	nameBox,
	openColours,
	openDress,
	saveLook,
	storedLooks,
} from "./looks-helpers";

test("opens the save form from the bookmark button", async ({ page }) => {
	// Given: both projects, a fresh account, the Dress page shown
	await openDress(page);
	// When
	await page.getByRole("button", { name: "Save look" }).click();
	// Then
	await expect(dialog(page)).toBeVisible();
	await expect(nameBox(page)).toHaveAttribute("placeholder", "Polo + sweater");
	await expect(
		dialog(page).getByRole("button", { name: "Cancel", exact: true }),
	).toBeVisible();
	await expect(
		dialog(page).getByRole("button", { name: "Save", exact: true }),
	).toBeVisible();
});

test("stores nothing on Cancel, Esc, or a click outside", async ({ page }) => {
	// Given: both projects, the Dress page shown
	await openDress(page);
	const closers = [
		() => dialog(page).getByRole("button", { name: "Cancel" }).click(),
		() => page.keyboard.press("Escape"),
		() => page.mouse.click(5, 5),
	];
	for (const close of closers) {
		// When
		await page.getByRole("button", { name: "Save look" }).click();
		await nameBox(page).fill("Gone");
		await close();
		// Then
		await expect(dialog(page)).toHaveCount(0);
	}
	expect(await storedLooks(page)).toEqual({ looks: [] });
});

test("saves a look and shows the toast", async ({ page }) => {
	// Given: both projects, the Dress page shown
	await openDress(page);
	// When
	await page.getByRole("button", { name: "Save look" }).click();
	await nameBox(page).fill("Navy day");
	await dialog(page).getByRole("button", { name: "Save", exact: true }).click();
	// Then
	await expect(page.locator('[data-slot="toast"]')).toHaveText(
		"Saved to Looks",
	);
	await expect(dialog(page)).toHaveCount(0);
	const { looks } = await storedLooks(page);
	expect(looks.map(({ id: _, ...look }) => look)).toEqual([
		{
			name: "Navy day",
			modeId: "polo-sweater",
			colours: { chino_p: "#C9B38C", polo_l: "#F3F1EC", sweater: "#1F3A5F" },
			open: [],
			tags: [],
		},
	]);
});

test("keeps the form open when saving fails", async ({ page }) => {
	// Given: both projects, the Dress page shown, each save answered 500
	await openDress(page);
	await page.route("**/api/looks", (route) =>
		route.request().method() === "POST"
			? route.fulfill({ status: 500 })
			: route.continue(),
	);
	// When
	await page.getByRole("button", { name: "Save look" }).click();
	await nameBox(page).fill("Navy day");
	await dialog(page).getByRole("button", { name: "Save", exact: true }).click();
	// Then
	await expect(dialog(page)).toContainText("Not saved. Try again.");
	await expect(nameBox(page)).toHaveValue("Navy day");
});

test("shows the sign-in screen when the save answers 401", async ({ page }) => {
	// Given: both projects, the Dress page shown; then the session is gone
	// for the session check and for each save. The form's own read of the
	// looks goes through, so the 401 comes from the save.
	await openDress(page);
	const noSession = { status: 401, json: { error: "unauthorized" } };
	await page.route("/api/me", (route) => route.fulfill(noSession));
	await page.route("**/api/looks", (route) =>
		route.request().method() === "POST"
			? route.fulfill(noSession)
			: route.continue(),
	);
	// When
	await page.getByRole("button", { name: "Save look" }).click();
	await dialog(page).getByRole("button", { name: "Save", exact: true }).click();
	// Then
	await expect(
		page.getByRole("button", { name: "Sign in with Google" }),
	).toBeVisible();
});

const LIMIT_HINT =
	"You have 300 looks. That is the limit. Delete one to save a new one.";

test.describe("an account with 300 looks", () => {
	test.use({ storageState: LIMIT_FILE });

	test("turns Save off and shows the limit hint at 300 looks", async ({
		page,
	}) => {
		// Given: both projects, the account with 300 looks, the Dress page shown
		await openDress(page);
		// When
		await page.getByRole("button", { name: "Save look" }).click();
		// Then
		await expect(dialog(page).getByRole("alert")).toHaveText(LIMIT_HINT);
		await expect(
			dialog(page).getByRole("button", { name: "Save", exact: true }),
		).toBeDisabled();
		await expect(
			dialog(page).getByRole("button", { name: "Cancel", exact: true }),
		).toBeEnabled();
	});
});

test("shows the limit hint when the save answers look_limit", async ({
	page,
}) => {
	// Given: both projects, a fresh account, the save form open; each save
	// answered 409 look_limit, as from a second tab that filled the account
	await openDress(page);
	await page.route("**/api/looks", (route) =>
		route.request().method() === "POST"
			? route.fulfill({ status: 409, json: { error: "look_limit" } })
			: route.continue(),
	);
	await page.getByRole("button", { name: "Save look" }).click();
	// When
	await dialog(page).getByRole("button", { name: "Save", exact: true }).click();
	// Then
	await expect(dialog(page).getByRole("alert")).toHaveText(LIMIT_HINT);
	await expect(
		dialog(page).getByRole("button", { name: "Save", exact: true }),
	).toBeDisabled();
});

const sweaterOf = (page: Page, name: string) =>
	card(page, name).locator('[data-garment="sweater"]');

test("shows a saved look with its name and one with no name", async ({
	page,
}) => {
	// Given: both projects, the Colours tab on the phone
	await openColours(page);
	// When
	await page
		.getByRole("button", { name: "Sweater #7A2E2E", exact: true })
		.click();
	await saveLook(page, "Red sweater");
	await saveLook(page, "");
	await page.goto("/looks");
	// Then
	await expect(page.locator('[data-slot="look-card"]')).toHaveText([
		"Polo + sweater",
		"Red sweater",
	]);
	for (const name of ["Polo + sweater", "Red sweater"])
		expect(await sweaterOf(page, name).innerHTML()).toContain('fill="#7A2E2E"');
});

test("keeps a look's colour after its square is removed", async ({ page }) => {
	// Given: both projects; Sweater #7A2E2E picked and a look "Red sweater" saved
	await openColours(page);
	const red = page.getByRole("button", {
		name: "Sweater #7A2E2E",
		exact: true,
	});
	await red.click();
	await saveLook(page, "Red sweater");
	// When
	await page.getByRole("button", { name: "Edit colours" }).click();
	await page
		.getByRole("button", { name: "Sweater #7A2E2E, remove", exact: true })
		.click();
	await page.getByRole("button", { name: "Done" }).click();
	// Then
	await expect(red).toHaveCount(0);
	// When
	await page.getByRole("link", { name: "Looks" }).click();
	// Then
	await expect(card(page, "Red sweater")).toBeVisible();
	expect(await sweaterOf(page, "Red sweater").innerHTML()).toContain(
		'fill="#7A2E2E"',
	);
});

test("draws a look card in the account's skin and hair", async ({ page }) => {
	// Given: both projects, a fresh account with skin #8D5524 and hair
	// #B55239, and one look saved
	await openDress(page);
	for (const [part, hex] of [
		["skin", "#8D5524"],
		["hair", "#B55239"],
	]) {
		const res = await page.request.post("/api/dress/changes", {
			data: { kind: "mannequin", part, hex },
		});
		expect(res.status()).toBe(204);
	}
	await saveLook(page, "Mine");
	// When
	await page.goto("/looks");
	// Then: polled, since the card draws a grey placeholder until the
	// account's skin and hair load, and those can come after the looks
	await expect
		.poll(async () => {
			const drawn = await card(page, "Mine").locator("svg").innerHTML();
			return {
				skin: drawn.includes('fill="#8D5524"'),
				hair: drawn.includes('fill="#B55239"'),
			};
		})
		.toEqual({ skin: true, hair: true });
});

test("fills the page on a phone and keeps the right part free from 900 px", async ({
	page,
}) => {
	// Given: both projects, one look saved through the form, then /looks open
	await openDress(page);
	await saveLook(page, "");
	await page.goto("/looks");
	await expect(page.locator('[data-slot="look-card"]')).toHaveCount(1);
	// When
	const wall = await page.locator('[data-slot="look-wall"]').boundingBox();
	const panel = page.locator('[data-slot="look-panel"]');
	// Then
	if (isPhone(page)) {
		expect({ x: wall?.x, width: wall?.width }).toEqual({ x: 0, width: 375 });
		await expect(panel).toBeHidden();
	} else {
		const box = await panel.boundingBox();
		expect({
			panelX: box?.x,
			panelWidth: box?.width,
			wallRight: (wall?.x ?? 0) + (wall?.width ?? 0),
		}).toEqual({ panelX: 1020, panelWidth: 420, wallRight: 1020 });
	}
});

test("shows the sign-in screen when the looks answer 401", async ({ page }) => {
	// Given: both projects, the Dress page shown; then the session is gone
	// for the session check and for the looks
	await openDress(page);
	const noSession = { status: 401, json: { error: "unauthorized" } };
	await page.route("/api/me", (route) => route.fulfill(noSession));
	await page.route("**/api/looks", (route) => route.fulfill(noSession));
	// When
	await page.getByRole("link", { name: "Looks" }).click();
	// Then
	await expect(
		page.getByRole("button", { name: "Sign in with Google" }),
	).toBeVisible();
});

test("shows No looks yet and goes to Dress", async ({ page }) => {
	// Given: both projects, a fresh account with no looks, /looks open
	await page.goto("/looks");
	// Then
	await expect(
		page.getByRole("heading", { name: "No looks yet" }),
	).toBeVisible();
	// When
	await page.getByRole("link", { name: "Go to Dress" }).click();
	// Then
	await expect(page).toHaveURL("/");
	await expect(page.getByRole("button", { name: "Save look" })).toBeVisible();
});

test("shows skeleton cards while the looks load", async ({ page }) => {
	// Given: GET /api/looks held until the test lets it go
	let release = () => {};
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	await page.route("**/api/looks", async (route) => {
		await held;
		await route.continue();
	});
	// When
	await page.goto("/looks");
	// Then
	await expect(page.locator('[data-slot="look-skeleton"]')).toHaveCount(6);
	await expect(page.locator('[data-slot="look-panel"]')).toHaveCount(1);
	release();
	await expect(page.locator('[data-slot="look-skeleton"]')).toHaveCount(0);
	await expect(
		page.getByRole("heading", { name: "No looks yet" }),
	).toBeVisible();
});

test("shows Retry when the wall cannot load", async ({ page }) => {
	// Given: the first GET /api/looks answered 500, the next ones passed on
	let failed = false;
	await page.route("**/api/looks", (route) => {
		if (failed) return route.continue();
		failed = true;
		return route.fulfill({ status: 500 });
	});
	// When
	await page.goto("/looks");
	// Then
	await expect(
		page.getByRole("heading", { name: "Could not load your looks" }),
	).toBeVisible();
	// When
	await page.getByRole("button", { name: "Retry" }).click();
	// Then
	await expect(
		page.getByRole("heading", { name: "No looks yet" }),
	).toBeVisible();
});

test("shows Could not load your looks when the looks answer does not match", async ({
	page,
}) => {
	// Given: a GET /api/looks answers a look with no mode, colours, or tags
	const pageErrors: Error[] = [];
	page.on("pageerror", (error) => pageErrors.push(error));
	await page.route("**/api/looks", (route) =>
		route.request().method() === "GET"
			? route.fulfill({ status: 200, json: { looks: [{ id: "x" }] } })
			: route.continue(),
	);
	// When
	await page.goto("/looks");
	// Then
	await expect(
		page.getByRole("heading", { name: "Could not load your looks" }),
	).toBeVisible();
	await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
	expect(pageErrors).toEqual([]);
});

test("leaves out the right part when there is no look to pick", async ({
	page,
}) => {
	// Given: both projects, a fresh account with no looks; the first
	// GET /api/looks answered 500, the next ones passed on
	let failed = false;
	await page.route("**/api/looks", (route) => {
		if (failed) return route.continue();
		failed = true;
		return route.fulfill({ status: 500 });
	});
	const panel = page.locator('[data-slot="look-panel"]');
	// When
	await page.goto("/looks");
	// Then
	await expect(
		page.getByRole("heading", { name: "Could not load your looks" }),
	).toBeVisible();
	await expect(panel).toHaveCount(0);
	// When
	await page.getByRole("button", { name: "Retry" }).click();
	// Then
	await expect(
		page.getByRole("heading", { name: "No looks yet" }),
	).toBeVisible();
	await expect(panel).toHaveCount(0);
});

test("shows a new look on the wall at once after the wall was seen empty", async ({
	page,
}) => {
	// Given: both projects, a fresh account; /looks seen empty, then a look
	// "Fresh" saved from the Dress page
	await page.goto("/looks");
	await page.getByRole("link", { name: "Go to Dress" }).click();
	await saveLook(page, "Fresh");
	// When: the next GET /api/looks never answers
	await page.route("**/api/looks", () => {});
	await page.getByRole("link", { name: "Looks" }).click();
	// Then
	await expect(card(page, "Fresh")).toBeVisible();
});
