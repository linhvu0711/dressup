import type { Page } from "@playwright/test";
import { postOwnedItems } from "./closet-helpers";
import { expect, test } from "./fixtures";
import { BRANDS_FULL_FILE } from "./global-setup";
import { colourIds, postBrand } from "./label-helpers";
import { sheet, toast } from "./locators";
import { postShopLink, postWish } from "./wishlist-helpers";

const rows = (page: Page) =>
	page.locator('[data-slot="brand-list"]').getByRole("button");

const rowNames = (page: Page) =>
	rows(page).evaluateAll((buttons) =>
		buttons.map((b) => b.getAttribute("aria-label")),
	);

const addSheet = (page: Page) => sheet(page, "New brand");

const nameBox = (page: Page) =>
	sheet(page).getByRole("textbox", { name: "Name" });

async function openBrands(page: Page) {
	await page.goto("/labels");
	await page.getByRole("tab", { name: "Brands" }).click();
}

async function addThroughForm(page: Page, name: string) {
	await page.getByRole("button", { name: "Add a brand" }).click();
	await nameBox(page).fill(name);
	await addSheet(page)
		.getByRole("button", { name: "Save", exact: true })
		.click();
}

test("shows Colours, Brands, and Tags in one row of the switch", async ({
	page,
}) => {
	// Given: a fresh account
	// When
	await page.goto("/labels");
	// Then
	const tablist = page.getByRole("tablist", { name: "Labels" });
	await expect(tablist.getByRole("tab")).toHaveCount(3);
	expect({
		tabs: await tablist.getByRole("tab").allTextContents(),
		selected: await tablist.getByRole("tab", { selected: true }).textContent(),
		height: (await tablist.boundingBox())?.height,
	}).toEqual({
		tabs: ["Colours", "Brands", "Tags"],
		selected: "Colours",
		height: 38,
	});
});

test("shows No brands yet for a new account", async ({ page }) => {
	// Given: a fresh account, /labels open
	await page.goto("/labels");
	// When
	await page.getByRole("tab", { name: "Brands" }).click();
	// Then
	await expect(
		page.getByRole("heading", { name: "No brands yet" }),
	).toBeVisible();
	await expect(page.getByText("Tap + to add your first brand.")).toBeVisible();
	await expect(page.getByRole("button", { name: "Add a brand" })).toBeVisible();
});

test("adds brands and lists them A to Z", async ({ page }) => {
	// Given: a fresh account, the Brands part open
	await openBrands(page);
	// When
	for (const name of ["Zara", "acne", "COS"]) {
		await addThroughForm(page, name);
		await expect(addSheet(page)).toHaveCount(0);
	}
	// Then
	await expect(toast(page)).toHaveText("Brand added");
	await expect(rows(page)).toHaveCount(3);
	expect(await rowNames(page)).toEqual(["acne", "COS", "Zara"]);
});

test("says a taken name is taken, in any case", async ({ page }) => {
	// Given: a fresh account with the brand Zara added through the form
	await openBrands(page);
	await addThroughForm(page, "Zara");
	await expect(rows(page)).toHaveCount(1);
	// When
	await addThroughForm(page, "zara");
	// Then
	await expect(addSheet(page).getByRole("alert")).toHaveText(
		"You have this brand already.",
	);
	// The open sheet hides the page from roles, so the rows are read as items.
	await expect(page.locator('[data-slot="brand-list"] li')).toHaveText([
		"Zara",
	]);
});

test("asks for a name and sends nothing", async ({ page }) => {
	// Given: a fresh account, the Brands part open
	let posts = 0;
	page.on("request", (r) => {
		if (r.method() === "POST" && r.url().endsWith("/api/brands")) posts++;
	});
	await openBrands(page);
	// When
	await page.getByRole("button", { name: "Add a brand" }).click();
	await addSheet(page)
		.getByRole("button", { name: "Save", exact: true })
		.click();
	// Then
	await expect(addSheet(page).getByRole("alert")).toHaveText("Enter a name.");
	expect(posts).toBe(0);
});

test("keeps the name to 24 characters", async ({ page }) => {
	// Given: a fresh account, "New brand" open
	await openBrands(page);
	await page.getByRole("button", { name: "Add a brand" }).click();
	// When
	await nameBox(page).pressSequentially("ABCDEFGHIJKLMNOPQRSTUVWXYZ");
	// Then
	await expect(nameBox(page)).toHaveValue("ABCDEFGHIJKLMNOPQRSTUVWX");
});

test("keeps the form open with Not saved when Save fails", async ({ page }) => {
	// Given: a fresh account, the Brands part open; the add answers 500
	await openBrands(page);
	await page.route("**/api/brands", (route) =>
		route.request().method() === "POST"
			? route.fulfill({ status: 500 })
			: route.fallback(),
	);
	// When
	await addThroughForm(page, "Zara");
	// Then
	await expect(addSheet(page).getByRole("alert")).toHaveText(
		"Not saved. Try again.",
	);
	await expect(nameBox(page)).toHaveValue("Zara");
});

test("renames a brand", async ({ page }) => {
	// Given: a fresh account with Zara and COS added through the form
	await openBrands(page);
	for (const name of ["Zara", "COS"]) {
		await addThroughForm(page, name);
		await expect(addSheet(page)).toHaveCount(0);
	}
	// When
	await page.getByRole("button", { name: "Zara" }).click();
	await nameBox(page).fill("Zara Home");
	await sheet(page, "Edit brand")
		.getByRole("button", { name: "Save", exact: true })
		.click();
	// Then
	await expect(toast(page)).toHaveText("Changes saved");
	await expect(rows(page)).toHaveCount(2);
	expect(await rowNames(page)).toEqual(["COS", "Zara Home"]);
});

test("deletes a brand from the confirm step", async ({ page }) => {
	// Given: a fresh account with Zara added
	await openBrands(page);
	await addThroughForm(page, "Zara");
	await expect(rows(page)).toHaveCount(1);
	// When
	await page.getByRole("button", { name: "Zara" }).click();
	await sheet(page, "Edit brand")
		.getByRole("button", { name: "Delete" })
		.click();
	const confirm = sheet(page, "Delete this brand?");
	await expect(confirm.getByText("No item uses it.")).toBeVisible();
	await expect(confirm.getByRole("button", { name: "Back" })).toBeVisible();
	await confirm.getByRole("button", { name: "Delete" }).click();
	// Then
	await expect(toast(page)).toHaveText("Brand deleted");
	await expect(
		page.getByRole("heading", { name: "No brands yet" }),
	).toBeVisible();
});

test("says how many items lose the brand and clears it", async ({ page }) => {
	// Given: a fresh account with Zara; a Navy long button-up, a White short
	// tee, and a Black long tee, each from Zara
	await page.goto("/");
	const ids = await colourIds(page);
	const zara = await postBrand(page, "Zara");
	await postOwnedItems(
		page,
		{ typeId: "shirt_l", colourId: ids.Navy, brandId: zara, quantity: 1 },
		{ typeId: "tee_s", colourId: ids.White, brandId: zara, quantity: 1 },
		{ typeId: "tee_l", colourId: ids.Black, brandId: zara, quantity: 1 },
	);
	await openBrands(page);
	// When
	await page.getByRole("button", { name: "Zara" }).click();
	await sheet(page, "Edit brand")
		.getByRole("button", { name: "Delete" })
		.click();
	const confirm = sheet(page, "Delete this brand?");
	// Then
	await expect(confirm.getByText("3 items lose their brand.")).toBeVisible();
	// When
	await confirm.getByRole("button", { name: "Delete" }).click();
	await expect(toast(page)).toHaveText("Brand deleted");
	await page.goto(`/piece/shirt_l/${ids.Navy}`);
	// Then
	await expect(
		page
			.getByRole("region", { name: "In your closet" })
			.getByRole("button", { name: "No brand × 1" }),
	).toBeVisible();
});

test.describe("an account with 100 brands", () => {
	test.use({ storageState: BRANDS_FULL_FILE });

	test("turns Save off at 100 brands", async ({ page }) => {
		// Given: the account with 100 brands, the Brands part open
		await openBrands(page);
		await expect(rows(page)).toHaveCount(100);
		// When
		await page.getByRole("button", { name: "Add a brand" }).click();
		// Then
		await expect(addSheet(page).getByRole("alert")).toHaveText(
			"You have 100 brands. That is the limit. Delete one to add a new one.",
		);
		await expect(
			addSheet(page).getByRole("button", { name: "Save", exact: true }),
		).toBeDisabled();
	});

	test("scrolls to the last of 100 brands", async ({ page }) => {
		// Given: the account with 100 brands, the Brands part open
		await openBrands(page);
		await expect(rows(page)).toHaveCount(100);
		// When: the wheel, as a person scrolls; a scroll from code would also
		// move the shell's clipped box
		await page.locator('[data-slot="brand-list"]').hover();
		await page.mouse.wheel(0, 10000);
		// Then
		await expect(
			page.getByRole("button", { name: "Brand 99" }),
		).toBeInViewport();
	});
});

test("shows skeleton rows while the brands load", async ({ page }) => {
	// Given: a fresh account; GET /api/brands held until the test lets it go
	let release = () => {};
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	await page.route("**/api/brands", async (route) => {
		await held;
		await route.continue();
	});
	await page.goto("/labels");
	// When
	await page.getByRole("tab", { name: "Brands" }).click();
	// Then
	const loading = page.locator('[data-slot="brand-list-loading"] li');
	await expect(loading).toHaveCount(6);
	release();
	await expect(
		page.getByRole("heading", { name: "No brands yet" }),
	).toBeVisible();
	await expect(loading).toHaveCount(0);
});

test("shows Could not load your brands and loads on Retry", async ({
	page,
}) => {
	// Given: a fresh account; the first GET /api/brands answers 500
	let calls = 0;
	await page.route("**/api/brands", (route) =>
		calls++ === 0 ? route.fulfill({ status: 500 }) : route.continue(),
	);
	// When
	await openBrands(page);
	await expect(
		page.getByRole("heading", { name: "Could not load your brands" }),
	).toBeVisible();
	await page.getByRole("button", { name: "Retry" }).click();
	// Then
	await expect(
		page.getByRole("heading", { name: "No brands yet" }),
	).toBeVisible();
});

test("shows the sign-in screen when the brands answer 401", async ({
	page,
}) => {
	// Given: / open and its session check passed; then the session is gone for
	// the session check and for the brands
	await page.goto("/");
	await expect(
		page.getByRole("navigation", { name: "Main" }).getByRole("link", {
			name: "Labels",
		}),
	).toBeVisible();
	const noSession = { status: 401, json: { error: "unauthorized" } };
	await page.route("/api/me", (route) => route.fulfill(noSession));
	await page.route("**/api/brands", (route) => route.fulfill(noSession));
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

test("counts shop links in the delete confirm and shows the host after", async ({
	page,
}) => {
	// Given: a fresh account with Zara on one link of a Charcoal wool jacket
	// wish
	await page.goto("/");
	const ids = await colourIds(page);
	const zara = await postBrand(page, "Zara");
	const wish = await postWish(page, { typeId: "wool", colourId: ids.Charcoal });
	await postShopLink(page, wish, {
		url: "https://www.zara.com/b",
		brandId: zara,
		name: "Wool blend jacket",
		price: null,
	});
	await openBrands(page);
	// When
	await page.getByRole("button", { name: "Zara" }).click();
	await sheet(page, "Edit brand")
		.getByRole("button", { name: "Delete" })
		.click();
	const confirm = sheet(page, "Delete this brand?");
	// Then
	await expect(confirm.getByText("1 shop link loses its brand.")).toBeVisible();
	// When
	await confirm.getByRole("button", { name: "Delete" }).click();
	await expect(toast(page)).toHaveText("Brand deleted");
	await page.goto(`/piece/wool/${ids.Charcoal}`);
	// Then
	await expect(
		page.locator('[data-slot="shop-link"]').first().locator("p").first(),
	).toHaveText("zara.com");
});
