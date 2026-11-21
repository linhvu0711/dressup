import type { Page } from "@playwright/test";
import { postOwnedItems } from "./closet-helpers";
import { isPhone, postCombinations } from "./combination-helpers";
import { expect, test } from "./fixtures";
import { colourIds, postBrand } from "./label-helpers";
import { sheet, toast } from "./locators";
import { uploadPng } from "./picture-helpers";

const facts = (page: Page) => page.locator('[data-slot="item-facts"]');

const fact = (page: Page, term: string) =>
	facts(page)
		.locator("div")
		.filter({ has: page.getByText(term, { exact: true }) })
		.locator("dd");

const bigPicture = (page: Page) =>
	page.locator('[data-slot="item-picture"] img');

// One plain item, a White short tee with no brand, on a fresh account.
async function postPlainTee(page: Page, quantity = 1) {
	await page.goto("/");
	const ids = await colourIds(page);
	const [id] = await postOwnedItems(page, {
		typeId: "tee_s",
		colourId: ids.White,
		brandId: null,
		quantity,
	});
	return id;
}

// The Uniqlo Oxford shirt with three pictures.
async function postOxfordShirt(page: Page) {
	await page.goto("/");
	const ids = await colourIds(page);
	const uniqlo = await postBrand(page, "Uniqlo");
	const pictures = [
		await uploadPng(page),
		await uploadPng(page),
		await uploadPng(page),
	];
	const [id] = await postOwnedItems(page, {
		typeId: "shirt_l",
		colourId: ids.Navy,
		brandId: uniqlo,
		quantity: 2,
		name: "Oxford shirt",
		price: 784000,
		pictureIds: pictures,
	});
	return { id, pictures };
}

test("shows an item's pictures, name, brand, price, facts, and actions", async ({
	page,
}) => {
	// Given: Navy long button-up, Uniqlo, 2, "Oxford shirt", 784000, three
	// pictures
	const { id, pictures } = await postOxfordShirt(page);
	// When
	await page.goto(`/closet/${id}`);
	// Then
	await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
	const header = page.getByRole("link", { name: "Back" }).locator("..");
	expect({
		heading: await page.getByRole("heading", { level: 1 }).textContent(),
		brand: await page.locator('[data-slot="item-brand"]').textContent(),
		price: await page.locator('[data-slot="item-price"]').textContent(),
		terms: await facts(page).locator("dt").allTextContents(),
		values: await facts(page).locator("dd").allTextContents(),
		thumbs: await page.locator('[data-slot="picture-thumbs"] button').count(),
		big: await bigPicture(page).getAttribute("src"),
		actions: await page
			.locator('[data-slot="item-actions"] button')
			.evaluateAll((buttons) =>
				buttons.map((b) => b.getAttribute("aria-label")),
			),
		header: await header
			.locator("a, button")
			.evaluateAll((parts) => parts.map((p) => p.getAttribute("aria-label"))),
	}).toEqual({
		heading: "Oxford shirt",
		brand: "Uniqlo",
		price: "784.000 ₫",
		terms: ["Type", "Colour", "Brand", "Quantity", "Price paid"],
		values: ["Long button-up", "Navy", "Uniqlo", "2", "784.000 ₫"],
		thumbs: 3,
		big: `/api/pictures/${pictures[0]}`,
		actions: ["Edit item", "Delete item"],
		header: ["Back"],
	});
});

test("opens the item page from its card", async ({ page }) => {
	// Given: White short tee, no brand, 1, named "Plain tee"
	await page.goto("/");
	const ids = await colourIds(page);
	const [id] = await postOwnedItems(page, {
		typeId: "tee_s",
		colourId: ids.White,
		brandId: null,
		quantity: 1,
		name: "Plain tee",
	});
	await page.goto("/closet");
	// When
	await page
		.getByRole("link", { name: "Plain tee, White short tee", exact: true })
		.click();
	// Then
	await expect(page).toHaveURL(`/closet/${id}`);
	await expect(page.getByRole("heading", { name: "Plain tee" })).toBeVisible();
});

test("shows the tapped thumbnail large", async ({ page }) => {
	// Given: the Oxford shirt's page open
	const { id, pictures } = await postOxfordShirt(page);
	await page.goto(`/closet/${id}`);
	// When
	await page.getByRole("button", { name: "Show picture 3 of 3" }).click();
	// Then
	await expect(bigPicture(page)).toHaveAttribute(
		"src",
		`/api/pictures/${pictures[2]}`,
	);
});

test("edits the item from Edit item", async ({ page }) => {
	// Given: White short tee, no brand, 2, its page open
	const id = await postPlainTee(page, 2);
	await page.goto(`/closet/${id}`);
	// When
	await page.getByRole("button", { name: "Edit item" }).click();
	const edit = sheet(page, "Edit item");
	await edit.getByRole("button", { name: "More" }).click();
	await edit.getByRole("button", { name: "Save" }).click();
	// Then
	await expect(toast(page)).toHaveText("Changes saved");
	await expect(fact(page, "Quantity")).toHaveText("3");
});

test("deletes the item from Delete item and goes back to the Closet", async ({
	page,
}) => {
	// Given: White short tee, no brand, 2, its page open
	const id = await postPlainTee(page, 2);
	await page.goto(`/closet/${id}`);
	// When
	await page.getByRole("button", { name: "Delete item" }).click();
	await page
		.getByRole("alertdialog", { name: "Remove this item?" })
		.getByRole("button", { name: "Delete" })
		.click();
	// Then
	await expect(toast(page)).toHaveText("Removed from your closet");
	await expect(page).toHaveURL("/closet");
});

test("names the item in its delete confirm", async ({ page }) => {
	// Given: White short tee named Gym tee, no brand, its page open
	await page.goto("/");
	const ids = await colourIds(page);
	const [id] = await postOwnedItems(page, {
		typeId: "tee_s",
		colourId: ids.White,
		brandId: null,
		quantity: 1,
		name: "Gym tee",
	});
	await page.goto(`/closet/${id}`);
	// When
	await page.getByRole("button", { name: "Delete item" }).click();
	// Then
	await expect(
		page.getByRole("alertdialog", { name: "Remove this item?" }),
	).toHaveAccessibleDescription("Gym tee · No brand");
});

test("shows Could not load your closet on the item page and loads on Retry", async ({
	page,
}) => {
	// Given: White short tee; the first GET /api/owned-items answered 500,
	// the next passed on
	const id = await postPlainTee(page);
	let failed = false;
	await page.route("**/api/owned-items", (route) => {
		if (failed) return route.continue();
		failed = true;
		return route.fulfill({ status: 500 });
	});
	// When
	await page.goto(`/closet/${id}`);
	await page
		.getByRole("heading", { name: "Could not load your closet" })
		.waitFor();
	await page.getByRole("button", { name: "Retry" }).click();
	// Then
	await expect(
		page.getByRole("heading", { name: "White short tee" }),
	).toBeVisible();
});

test("shows the placeholder while the closet loads, then the item", async ({
	page,
}) => {
	// Given: White short tee; GET /api/owned-items held until the test lets
	// it go
	const id = await postPlainTee(page);
	let release = () => {};
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	await page.route("**/api/owned-items", async (route) => {
		await held;
		await route.continue();
	});
	// When
	await page.goto(`/closet/${id}`);
	await page.locator('[data-slot="item-loading"]').waitFor();
	const placeholder = await page.locator('[data-slot="item-loading"]').count();
	release();
	const heading = page.getByRole("heading", { level: 1 });
	await heading.waitFor();
	// Then
	expect({
		placeholder,
		url: new URL(page.url()).pathname,
		heading: await heading.textContent(),
	}).toEqual({
		placeholder: 1,
		url: `/closet/${id}`,
		heading: "White short tee",
	});
});

test("goes back to the Closet when another tab deleted the item first", async ({
	page,
}) => {
	// Given: White short tee, its page open; a second tab deleted it, so
	// this tab's DELETE answers 404
	const id = await postPlainTee(page);
	await page.goto(`/closet/${id}`);
	await page.getByRole("heading", { name: "White short tee" }).waitFor();
	const gone = await page.request.delete(`/api/owned-items/${id}`);
	expect(gone.status()).toBe(204);
	// When
	await page.getByRole("button", { name: "Delete item" }).click();
	await page
		.getByRole("alertdialog", { name: "Remove this item?" })
		.getByRole("button", { name: "Delete" })
		.click();
	// Then
	await expect(toast(page)).toHaveText("Removed from your closet");
	await expect(page).toHaveURL("/closet");
});

test("sends the page of a deleted item back to the closet", async ({
	page,
}) => {
	// Given: White short tee, then deleted
	const id = await postPlainTee(page);
	const gone = await page.request.delete(`/api/owned-items/${id}`);
	expect(gone.status()).toBe(204);
	// When
	await page.goto(`/closet/${id}`);
	// Then
	await expect(page).toHaveURL("/closet");
});

test("sends the page of another account's item back to the closet", async ({
	page,
}) => {
	// Given: a fresh account; the 500-item account's first item
	// When
	await page.goto("/closet/00000000-0000-4000-8000-000000000001");
	// Then
	await expect(page).toHaveURL("/closet");
});

const combinationsPart = (page: Page) =>
	page.getByRole("region", { name: "Combinations with this piece" });

// A Navy long button-up and six combinations of it with chino pants.
async function postShirtWithCombinations(page: Page) {
	await page.goto("/");
	const ids = await colourIds(page);
	const [id] = await postOwnedItems(page, {
		typeId: "shirt_l",
		colourId: ids.Navy,
		brandId: null,
		quantity: 1,
	});
	await postCombinations(
		page,
		...["Khaki", "Beige", "Black", "Grey", "Olive", "Brown"].map((chinos) => ({
			id: crypto.randomUUID(),
			pieces: [
				{ typeId: "chino_p", colourId: ids[chinos] },
				{ typeId: "shirt_l", colourId: ids.Navy },
			],
		})),
	);
	return { id, navy: ids.Navy };
}

const shownCombinations = async (page: Page) => {
	const seeAll = combinationsPart(page).getByRole("link", { name: /^See all/ });
	await seeAll.waitFor();
	return {
		visible: await combinationsPart(page)
			.locator('[data-slot="combination-card"]:visible')
			.count(),
		seeAll: await seeAll.textContent(),
	};
};

test("shows five combinations with the piece on a laptop", async ({ page }) => {
	test.skip(isPhone(page), "a laptop shows five");
	// Given: a Navy long button-up and six combinations with it
	const { id } = await postShirtWithCombinations(page);
	// When
	await page.goto(`/closet/${id}`);
	// Then
	expect(await shownCombinations(page)).toEqual({
		visible: 5,
		seeAll: "See all 6",
	});
});

test("shows four combinations with the piece on a phone", async ({ page }) => {
	test.skip(!isPhone(page), "a phone shows four");
	// Given: a Navy long button-up and six combinations with it
	const { id } = await postShirtWithCombinations(page);
	// When
	await page.goto(`/closet/${id}`);
	// Then
	expect(await shownCombinations(page)).toEqual({
		visible: 4,
		seeAll: "See all 6",
	});
});

test("opens the wall filtered to the piece from See all", async ({ page }) => {
	// Given: a Navy long button-up and six combinations with it, its page open
	const { id, navy } = await postShirtWithCombinations(page);
	await page.goto(`/closet/${id}`);
	// When
	await combinationsPart(page).getByRole("link", { name: "See all 6" }).click();
	// Then
	await expect(page).toHaveURL(`/combinations?piece=shirt_l.${navy}`);
});

const addSheet = (page: Page) => sheet(page, "Add to closet");

// The header's "+", which comes before the empty notice's button.
async function openAddSheet(page: Page) {
	await page.goto("/closet");
	await page
		.getByRole("button", { name: "Add to closet", exact: true })
		.first()
		.click();
}

test("adds a named item with a price, opens its card, and sees both", async ({
	page,
}) => {
	// Given: a fresh account on /closet
	await openAddSheet(page);
	// When
	await addSheet(page).getByRole("button", { name: "Pick a type" }).click();
	await sheet(page, "Pick a type")
		.getByRole("button", { name: "Long button-up", exact: true })
		.click();
	await addSheet(page)
		.getByRole("radiogroup", { name: "Colour" })
		.getByRole("radio", { name: "Navy", exact: true })
		.click();
	await addSheet(page).getByLabel("Name").fill("Oxford shirt");
	await addSheet(page).getByLabel("Price paid").fill("784000");
	await addSheet(page).getByRole("button", { name: "Save" }).click();
	await page
		.getByRole("link", {
			name: "Oxford shirt, Navy long button-up, 784.000 ₫",
			exact: true,
		})
		.click();
	await expect(page).toHaveURL(/^[^?]*\/closet\/[^/]+$/);
	await page.locator('[data-slot="item-price"]').waitFor();
	// Then
	expect({
		heading: await page.getByRole("heading", { level: 1 }).textContent(),
		price: await page.locator('[data-slot="item-price"]').textContent(),
	}).toEqual({ heading: "Oxford shirt", price: "784.000 ₫" });
});

test("changes the name and price from the edit sheet", async ({ page }) => {
	// Given: Navy long button-up, no brand, 1, "Oxford shirt", 784000, its
	// page open
	await page.goto("/");
	const ids = await colourIds(page);
	const [id] = await postOwnedItems(page, {
		typeId: "shirt_l",
		colourId: ids.Navy,
		brandId: null,
		quantity: 1,
		name: "Oxford shirt",
		price: 784000,
	});
	await page.goto(`/closet/${id}`);
	// When
	await page.getByRole("button", { name: "Edit item" }).click();
	const edit = sheet(page, "Edit item");
	await edit.getByLabel("Name").fill("Linen shirt");
	await edit.getByLabel("Price paid").fill("899000");
	await edit.getByRole("button", { name: "Save" }).click();
	// Then
	await expect(toast(page)).toHaveText("Changes saved");
	await expect(page.getByRole("heading", { level: 1 })).toHaveText(
		"Linen shirt",
	);
	expect({
		toast: await toast(page).textContent(),
		heading: await page.getByRole("heading", { level: 1 }).textContent(),
		price: await page.locator('[data-slot="item-price"]').textContent(),
	}).toEqual({
		toast: "Changes saved",
		heading: "Linen shirt",
		price: "899.000 ₫",
	});
});

test("stops the name at 80 characters with its message", async ({ page }) => {
	// Given: a fresh account, Add to closet open
	await openAddSheet(page);
	// When
	await addSheet(page).getByLabel("Name").fill("a".repeat(81));
	// Then
	await expect(addSheet(page).getByRole("alert")).toBeVisible();
	expect({
		length: (await addSheet(page).getByLabel("Name").inputValue()).length,
		message: await addSheet(page).getByRole("alert").textContent(),
	}).toEqual({ length: 80, message: "Name is at most 80 characters." });
});

test("keeps only digits in the price with its message", async ({ page }) => {
	// Given: a fresh account, Add to closet open
	await openAddSheet(page);
	// When
	await addSheet(page).getByLabel("Price paid").pressSequentially("12a");
	// Then
	await expect(addSheet(page).getByRole("alert")).toBeVisible();
	expect({
		value: await addSheet(page).getByLabel("Price paid").inputValue(),
		message: await addSheet(page).getByRole("alert").textContent(),
	}).toEqual({
		value: "12",
		message: "Price is a whole number of VND from 1 to 999.999.999.",
	});
});

test("stops the price at 999.999.999 with its message", async ({ page }) => {
	// Given: a fresh account, Add to closet open
	await openAddSheet(page);
	// When
	await addSheet(page).getByLabel("Price paid").pressSequentially("1234567890");
	// Then
	await expect(addSheet(page).getByRole("alert")).toBeVisible();
	expect({
		value: await addSheet(page).getByLabel("Price paid").inputValue(),
		message: await addSheet(page).getByRole("alert").textContent(),
	}).toEqual({
		value: "123.456.789",
		message: "Price is a whole number of VND from 1 to 999.999.999.",
	});
});
