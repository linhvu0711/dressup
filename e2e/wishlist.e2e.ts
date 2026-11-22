import type { Page } from "@playwright/test";
import { postOwnedItems } from "./closet-helpers";
import { expect, test } from "./fixtures";
import { colourIds, postBrand } from "./label-helpers";
import { fact, sheet, toast } from "./locators";
import { WISHLIST_FULL_FILE } from "./paths";
import { jacketAndPolo, postShopLink, postWish } from "./wishlist-helpers";

const mainNav = (page: Page) => page.getByRole("navigation", { name: "Main" });

const wishCards = (page: Page) => page.locator('[data-slot="wish-card"]');

const labelsOf = (cards: ReturnType<Page["locator"]>) =>
	cards.evaluateAll((links) =>
		links.map((link) => link.getAttribute("aria-label")),
	);

const addSheet = (page: Page) => sheet(page, "Add to wishlist");

// The header's "+", which comes before the empty notice's button.
const openAddSheet = (page: Page) =>
	page
		.getByRole("button", { name: "Add to wishlist", exact: true })
		.first()
		.click();

// Picks a type and a colour in the open add sheet.
async function pickPiece(page: Page, type: string, colour: string) {
	await addSheet(page).getByRole("button", { name: "Pick a type" }).click();
	await sheet(page, "Pick a type")
		.getByRole("button", { name: type, exact: true })
		.click();
	await addSheet(page)
		.getByRole("radiogroup", { name: "Colour" })
		.getByRole("radio", { name: colour, exact: true })
		.click();
}

// Types the shop link's fields of the open add sheet.
async function fillLink(
	page: Page,
	link: { address?: string; name?: string; price?: string },
) {
	const form = addSheet(page);
	if (link.address !== undefined)
		await form.getByRole("textbox", { name: "Address" }).fill(link.address);
	if (link.name !== undefined)
		await form.getByRole("textbox", { name: "Name" }).fill(link.name);
	if (link.price !== undefined)
		await form.getByRole("textbox", { name: "Price in ₫" }).fill(link.price);
}

const saveForm = (page: Page) =>
	addSheet(page).getByRole("button", { name: "Save" }).click();

const fieldAlert = (page: Page, name: string) =>
	addSheet(page)
		.locator('[data-slot="field"]')
		.filter({ has: page.getByRole("textbox", { name, exact: true }) })
		.getByRole("alert");

const title = (page: Page) => page.getByRole("heading", { level: 1 });

test("opens the wishlist from the Wishlist tab", async ({ page }) => {
	// Given: a fresh account on /closet
	await page.goto("/closet");
	// When
	await mainNav(page).getByRole("link", { name: "Wishlist" }).click();
	// Then
	await expect(page).toHaveURL("/wishlist");
	await expect(
		page.getByRole("heading", { name: "Wishlist", exact: true }),
	).toBeVisible();
	await expect(mainNav(page).getByRole("link")).toHaveText([
		"Combinations",
		"Closet",
		"Wishlist",
		"Labels",
	]);
});

test("shows one card for each shop link and one for each wish with no link", async ({
	page,
}) => {
	// Given: a fresh account; a Charcoal wool jacket wish with a COS link and
	// a no-brand link; then an Olive long polo wish with no link
	await jacketAndPolo(page);
	// When
	await page.goto("/wishlist");
	// Then
	await expect(wishCards(page)).toHaveCount(3);
	expect({
		labels: await labelsOf(wishCards(page)),
		prices: await wishCards(page)
			.locator('[data-slot="item-price"]')
			.allInnerTexts(),
	}).toEqual({
		labels: [
			"Olive long polo, No shop link yet",
			"Single-breasted wool jacket, COS · Charcoal wool jacket",
			"Zara jacket, zara.com · Charcoal wool jacket",
		],
		prices: ["4.290.000 ₫", "588.000 ₫"],
	});
});

test("shows skeleton tiles while the wishlist loads", async ({ page }) => {
	// Given: GET /api/wishes held until the test lets it go
	let release = () => {};
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	await page.route("**/api/wishes", async (route) => {
		await held;
		await route.continue();
	});
	// When
	await page.goto("/wishlist");
	// Then
	await expect(page.locator('[data-slot="wish-skeleton"]')).toHaveCount(6);
	release();
	await expect(page.locator('[data-slot="wish-skeleton"]')).toHaveCount(0);
});

test("shows Could not load your wishlist and loads on Retry", async ({
	page,
}) => {
	// Given: the first GET /api/wishes answered 500, the next passed on
	let failed = false;
	await page.route("**/api/wishes", (route) => {
		if (failed) return route.continue();
		failed = true;
		return route.fulfill({ status: 500 });
	});
	// When
	await page.goto("/wishlist");
	// Then
	await expect(
		page.getByRole("heading", { name: "Could not load your wishlist" }),
	).toBeVisible();
	// When
	await page.getByRole("button", { name: "Retry" }).click();
	// Then
	await expect(
		page.getByRole("heading", { name: "Nothing on your wishlist yet" }),
	).toBeVisible();
});

test("shows the sign-in screen when the wishlist answers 401", async ({
	page,
}) => {
	// Given: / open; then the session is gone for the session check and for
	// the wishlist
	await page.goto("/");
	await expect(mainNav(page)).toBeVisible();
	const noSession = { status: 401, json: { error: "unauthorized" } };
	await page.route("/api/me", (route) => route.fulfill(noSession));
	await page.route("**/api/wishes", (route) => route.fulfill(noSession));
	// When
	await mainNav(page).getByRole("link", { name: "Wishlist" }).click();
	// Then
	await expect(
		page.getByRole("button", { name: "Sign in with Google" }),
	).toBeVisible();
});

test("shows Nothing on your wishlist yet with a button to the form", async ({
	page,
}) => {
	// Given: a fresh account
	await page.goto("/wishlist");
	await expect(
		page.getByRole("heading", { name: "Nothing on your wishlist yet" }),
	).toBeVisible();
	await expect(page.getByText("Add the pieces you want to buy.")).toBeVisible();
	// When: the empty state's button, the second "Add to wishlist"
	await page
		.getByRole("main")
		.getByRole("button", { name: "Add to wishlist", exact: true })
		.last()
		.click();
	// Then
	await expect(addSheet(page)).toBeVisible();
});

test("keeps the form open with Not saved when the save fails", async ({
	page,
}) => {
	// Given: a fresh account; POST /api/wishlist answers 500
	await page.route("**/api/wishlist", (route) =>
		route.request().method() === "POST"
			? route.fulfill({ status: 500 })
			: route.continue(),
	);
	await page.goto("/wishlist");
	// When
	await openAddSheet(page);
	await pickPiece(page, "Long polo", "Olive");
	await fillLink(page, { address: "https://shop.example/p", name: "Polo" });
	await saveForm(page);
	await expect(addSheet(page).getByRole("alert")).toBeVisible();
	// Then
	expect({
		alert: await addSheet(page).getByRole("alert").textContent(),
		address: await addSheet(page)
			.getByRole("textbox", { name: "Address" })
			.inputValue(),
		name: await addSheet(page)
			.getByRole("textbox", { name: "Name" })
			.inputValue(),
	}).toEqual({
		alert: "Not saved. Try again.",
		address: "https://shop.example/p",
		name: "Polo",
	});
});

test("saves one wish and one link when a lost answer is sent again", async ({
	page,
}) => {
	// Given: a fresh account; the first POST /api/wishlist reaches the server
	// and then answers 500, the next passes on
	let lost = false;
	await page.route("**/api/wishlist", async (route) => {
		if (lost || route.request().method() !== "POST") return route.continue();
		lost = true;
		await route.fetch();
		return route.fulfill({ status: 500 });
	});
	await page.goto("/wishlist");
	// When
	await openAddSheet(page);
	await pickPiece(page, "Long polo", "Olive");
	await fillLink(page, { address: "https://shop.example/p", name: "Polo" });
	await saveForm(page);
	await expect(addSheet(page).getByRole("alert")).toHaveText(
		"Not saved. Try again.",
	);
	await saveForm(page);
	await expect(title(page)).toHaveText("Polo");
	// Then
	const { wishes } = (await (await page.request.get("/api/wishes")).json()) as {
		wishes: { shopLinks: { name: string }[] }[];
	};
	expect({
		wishes: wishes.map((w) => ({ links: w.shopLinks.map((l) => l.name) })),
		title: await title(page).textContent(),
	}).toEqual({ wishes: [{ links: ["Polo"] }], title: "Polo" });
});

test("says a full wish when another tab filled it", async ({ page }) => {
	// Given: a fresh account; POST /api/wishlist answers 409 shop_link_limit
	await page.route("**/api/wishlist", (route) =>
		route.request().method() === "POST"
			? route.fulfill({ status: 409, json: { error: "shop_link_limit" } })
			: route.continue(),
	);
	await page.goto("/wishlist");
	// When
	await openAddSheet(page);
	await pickPiece(page, "Long polo", "Olive");
	await fillLink(page, { address: "https://shop.example/p", name: "Polo" });
	await saveForm(page);
	await expect(addSheet(page).getByRole("alert")).toBeVisible();
	// Then
	expect({
		alert: await addSheet(page).getByRole("alert").textContent(),
		save: (await addSheet(page)
			.getByRole("button", { name: "Save" })
			.isDisabled())
			? "disabled"
			: "enabled",
	}).toEqual({
		alert: "10 shop links is the limit for one wish.",
		save: "disabled",
	});
});

test("asks for a web address under the Address field", async ({ page }) => {
	// Given: the form with Short tee, White
	await page.goto("/wishlist");
	await openAddSheet(page);
	await pickPiece(page, "Short tee", "White");
	// When
	await fillLink(page, { address: "www.zara.com" });
	await saveForm(page);
	// Then
	await expect(fieldAlert(page, "Address")).toHaveText(
		"Enter a web address that starts with https://.",
	);
});

test("asks for a web address when only a picture still shrinking is set", async ({
	page,
}) => {
	// Given: the form with Short tee, White; the browser never finishes
	// reading a picked picture, so it stays shrinking
	await page.addInitScript(() => {
		window.createImageBitmap = () => new Promise(() => {});
	});
	await page.goto("/wishlist");
	await openAddSheet(page);
	await pickPiece(page, "Short tee", "White");
	// When
	await addSheet(page)
		.locator('input[type="file"]')
		.setInputFiles({
			name: "tee.jpg",
			mimeType: "image/jpeg",
			buffer: Buffer.from("tee"),
		});
	await saveForm(page);
	// Then
	await expect(fieldAlert(page, "Address")).toHaveText(
		"Enter a web address that starts with https://.",
	);
});

test("asks for a name under the Name field", async ({ page }) => {
	// Given: the form with Short tee, White
	await page.goto("/wishlist");
	await openAddSheet(page);
	await pickPiece(page, "Short tee", "White");
	// When
	await fillLink(page, { address: "https://www.zara.com/t" });
	await saveForm(page);
	// Then
	await expect(fieldAlert(page, "Name")).toHaveText("Enter a name.");
});

test("keeps the price to digits with dots and the name to 80 characters", async ({
	page,
}) => {
	// Given: the form open
	await page.goto("/wishlist");
	await openAddSheet(page);
	// When
	await addSheet(page)
		.getByRole("textbox", { name: "Price in ₫" })
		.pressSequentially("12a3456");
	await addSheet(page)
		.getByRole("textbox", { name: "Name" })
		.pressSequentially("x".repeat(81));
	// Then
	expect({
		price: await addSheet(page)
			.getByRole("textbox", { name: "Price in ₫" })
			.inputValue(),
		name: (
			await addSheet(page).getByRole("textbox", { name: "Name" }).inputValue()
		).length,
	}).toEqual({ price: "123.456", name: 80 });
});

test.describe("at the wishlist limit", () => {
	test.use({ storageState: WISHLIST_FULL_FILE });

	test("turns Save off and shows the limit line at 200 wishes", async ({
		page,
	}) => {
		// Given: the account with 200 wishes
		// When
		await page.goto("/wishlist");
		await openAddSheet(page);
		// Then
		await expect(addSheet(page).getByRole("alert")).toHaveText(
			"You have 200 wishes. That is the limit. Delete one to add a new one.",
		);
		await expect(
			addSheet(page).getByRole("button", { name: "Save" }),
		).toBeDisabled();
	});
	test("says a full wish when the piece has 10 shop links", async ({
		page,
	}) => {
		// Given: the account with 200 wishes; the form with Short tee, White,
		// the wish with 10 links
		await page.goto("/wishlist");
		await openAddSheet(page);
		await pickPiece(page, "Short tee", "White");
		// When
		await fillLink(page, {
			address: "https://shop.example/11",
			name: "Link 11",
		});
		// Then
		expect({
			alert: await addSheet(page).getByRole("alert").textContent(),
			save: (await addSheet(page)
				.getByRole("button", { name: "Save" })
				.isDisabled())
				? "disabled"
				: "enabled",
		}).toEqual({
			alert: "10 shop links is the limit for one wish.",
			save: "disabled",
		});
	});

	test("keeps Save on at 200 wishes for a piece already wished for", async ({
		page,
	}) => {
		// Given: the account with 200 wishes; the form with Long tee, White, a
		// wish with no link
		await page.goto("/wishlist");
		await openAddSheet(page);
		await pickPiece(page, "Long tee", "White");
		// When
		await fillLink(page, {
			address: "https://shop.example/l",
			name: "Long tee",
		});
		// Then
		expect({
			alerts: await addSheet(page).getByRole("alert").count(),
			save: (await addSheet(page)
				.getByRole("button", { name: "Save" })
				.isDisabled())
				? "disabled"
				: "enabled",
		}).toEqual({ alerts: 0, save: "enabled" });
	});

	const openWall = async (page: Page) => {
		await page.goto("/wishlist");
		await expect(wishCards(page).first().locator("svg")).toHaveCount(1);
	};

	test("draws only the cards near the screen", async ({ page }) => {
		// Given: both projects, the account with 200 wishes
		// When
		await openWall(page);
		// Then
		const count = await wishCards(page)
			.filter({ has: page.locator("svg, img") })
			.count();
		expect(count).toBeGreaterThanOrEqual(1);
		expect(count).toBeLessThanOrEqual(60);
	});

	test("draws a far card when it scrolls near and drops the first one", async ({
		page,
	}) => {
		// Given: both projects, the account with 200 wishes, the wall open with the first card
		// drawn
		await openWall(page);
		const last = page.getByRole("link", {
			name: "Burgundy chino pants, No shop link yet",
		});
		// When
		await last.scrollIntoViewIfNeeded();
		// Then
		await expect(last.locator("svg")).toHaveCount(1);
		await expect(wishCards(page).first().locator("svg")).toHaveCount(0);
	});

	test("keeps every card on the page", async ({ page }) => {
		// Given: both projects, the account with 200 wishes
		// When
		await openWall(page);
		// Then
		await expect(wishCards(page)).toHaveCount(209);
		await expect(
			page.getByRole("link", {
				name: "Burgundy chino pants, No shop link yet",
			}),
		).toBeAttached();
	});
});

test("adds a wish with its first shop link from the one form and opens its page", async ({
	page,
}) => {
	// Given: a fresh account on /wishlist
	await page.goto("/wishlist");
	// When
	await openAddSheet(page);
	await pickPiece(page, "Wool jacket", "Charcoal");
	await fillLink(page, {
		address: "https://www.cos.com/c",
		name: "Wool coat",
		price: "3500000",
	});
	await saveForm(page);
	await expect(title(page)).toHaveText("Wool coat");
	// Then
	expect({
		toast: await toast(page).textContent(),
		title: await title(page).textContent(),
		price: await page.getByText("3.500.000 ₫").first().textContent(),
		path: new URL(page.url()).pathname,
	}).toEqual({
		toast: "Added to your wishlist",
		title: "Wool coat",
		price: "3.500.000 ₫",
		path: expect.stringMatching(/^\/wishlist\/link\//),
	});
});

test("adds a shop link to the wish a piece already has", async ({ page }) => {
	// Given: a fresh account with a Charcoal wool jacket wish holding the COS
	// link "Single-breasted wool jacket"
	await page.goto("/");
	const ids = await colourIds(page);
	const cos = await postBrand(page, "COS");
	const jacket = await postWish(page, {
		typeId: "wool",
		colourId: ids.Charcoal,
	});
	await postShopLink(page, jacket, {
		url: "https://www.cos.com/a",
		brandId: cos,
		name: "Single-breasted wool jacket",
		price: 4290000,
	});
	await page.goto("/wishlist");
	// When
	await openAddSheet(page);
	await pickPiece(page, "Wool jacket", "Charcoal");
	await fillLink(page, {
		address: "https://www.zara.com/c",
		name: "Zara coat",
	});
	await saveForm(page);
	await expect(title(page)).toHaveText("Zara coat");
	// Then
	expect({
		title: await title(page).textContent(),
		others: await page
			.locator('[data-slot="other-shop"]')
			.evaluateAll((links) => links.map((l) => l.getAttribute("aria-label"))),
		duplicate: await page.getByText("You have this wish already.").count(),
	}).toEqual({
		title: "Zara coat",
		others: ["Single-breasted wool jacket, COS · Charcoal wool jacket"],
		duplicate: 0,
	});
});

test("saves a wish alone with no address and opens its page", async ({
	page,
}) => {
	// Given: a fresh account on /wishlist
	await page.goto("/wishlist");
	// When
	await openAddSheet(page);
	await pickPiece(page, "Long polo", "Navy");
	await saveForm(page);
	await expect(title(page)).toHaveText("Navy long polo");
	// Then
	expect({
		title: await title(page).textContent(),
		note: await page.getByText("No shop link yet.").textContent(),
		path: new URL(page.url()).pathname,
	}).toEqual({
		title: "Navy long polo",
		note: "No shop link yet.",
		path: expect.stringMatching(/^\/wishlist\/wish\//),
	});
});

test("opens the newest card of a piece already wished for when there is no address", async ({
	page,
}) => {
	// Given: a fresh account with a Charcoal wool jacket wish holding the COS
	// link, then the link "Zara jacket"
	await jacketAndPolo(page);
	await page.goto("/wishlist");
	// When
	await openAddSheet(page);
	await pickPiece(page, "Wool jacket", "Charcoal");
	await saveForm(page);
	// Then
	await expect(title(page)).toHaveText("Zara jacket");
});

test("shows an address that is not http as text", async ({ page }) => {
	// Given: the wishlist answers one Charcoal wool jacket wish with one link
	// whose address is a script
	await page.goto("/");
	const ids = await colourIds(page);
	await page.route("**/api/wishes", (route) =>
		route.fulfill({
			json: {
				wishes: [
					{
						id: "11111111-1111-4111-8111-111111111111",
						typeId: "wool",
						colour: { id: ids.Charcoal, name: "Charcoal", hex: "#3A3F47" },
						shopLinks: [
							{
								id: "22222222-2222-4222-8222-222222222222",
								url: "javascript:alert(1)",
								brand: null,
								name: "Odd link",
								price: null,
								pictureIds: [],
							},
						],
					},
				],
			},
		}),
	);
	// When
	await page.goto("/wishlist/link/22222222-2222-4222-8222-222222222222");
	// Then
	await expect(fact(page, "Address")).toHaveText("javascript:alert(1)");
	await expect(fact(page, "Address").locator("a")).toHaveCount(0);
});

// A fresh account with a Charcoal wool jacket in the closet and on the
// wishlist; returns the jacket's piece page.
async function pieceInBoth(page: Page) {
	await page.goto("/");
	const ids = await colourIds(page);
	await postOwnedItems(page, {
		typeId: "wool",
		colourId: ids.Charcoal,
		brandId: null,
		quantity: 1,
	});
	await postWish(page, { typeId: "wool", colourId: ids.Charcoal });
	return `/piece/wool/${ids.Charcoal}`;
}

test("shows the closet part and the wishlist part for a piece in both", async ({
	page,
}) => {
	// Given: the jacket in both lists
	const piece = await pieceInBoth(page);
	// When
	await page.goto(piece);
	// Then
	await expect(page.getByRole("heading", { level: 2 })).toHaveText([
		"In your closet",
		"On your wishlist",
	]);
});

// Answers the first GET of the address 500 and passes on the rest.
async function failFirstLoad(page: Page, address: string) {
	let failed = false;
	await page.route(address, (route) => {
		if (failed || route.request().method() !== "GET") return route.continue();
		failed = true;
		return route.fulfill({ status: 500 });
	});
}

test("shows the wishlist part's failed load on the piece page and loads it on Retry", async ({
	page,
}) => {
	// Given: the jacket in both lists; the first load of the wishlist fails
	const piece = await pieceInBoth(page);
	await failFirstLoad(page, "**/api/wishes");
	// When
	await page.goto(piece);
	// Then: the closet part, and the wishlist part says it failed
	await expect(page.getByRole("heading", { level: 2 })).toHaveText([
		"In your closet",
		"On your wishlist",
	]);
	await expect(page.getByRole("alert")).toHaveText(
		"Could not load your wishlist.",
	);
	// When
	await page.getByRole("button", { name: "Retry" }).click();
	// Then
	await expect(page.getByRole("alert")).toHaveCount(0);
	await expect(page.locator('[data-slot="wish-card"]')).toHaveAccessibleName(
		"Charcoal wool jacket, No shop link yet",
	);
});

test("shows Could not load your closet and wishlist when both fail on the piece page", async ({
	page,
}) => {
	// Given: the jacket in both lists; the first load of each list fails
	const piece = await pieceInBoth(page);
	await failFirstLoad(page, "**/api/owned-items");
	await failFirstLoad(page, "**/api/wishes");
	// When
	await page.goto(piece);
	// Then
	await expect(
		page.getByRole("heading", {
			name: "Could not load your closet and wishlist",
		}),
	).toBeVisible();
	// When: one Retry loads both
	await page.getByRole("button", { name: "Retry" }).click();
	// Then
	await expect(page.getByRole("heading", { level: 2 })).toHaveText([
		"In your closet",
		"On your wishlist",
	]);
});

const linkSheet = (page: Page, name = "Add a shop link") => sheet(page, name);

// A fresh account with a Charcoal wool jacket wish, on its own page.
async function onJacketPage(page: Page) {
	await page.goto("/");
	const ids = await colourIds(page);
	const wish = await postWish(page, { typeId: "wool", colourId: ids.Charcoal });
	await page.goto(`/wishlist/wish/${wish}`);
	await expect(
		page.getByRole("heading", { level: 1, name: "Charcoal wool jacket" }),
	).toBeVisible();
	return { ids, wish };
}

const ZARA = "https://www.zara.com/vn/en/wool-blend-jacket.html";

test("adds a shop link from the sheet", async ({ page }) => {
	// Given
	await onJacketPage(page);
	// When
	await page.getByRole("button", { name: "Add a shop link" }).click();
	await linkSheet(page).getByRole("textbox", { name: "Address" }).fill(ZARA);
	await linkSheet(page)
		.getByRole("textbox", { name: "Name" })
		.fill("Wool blend jacket");
	await linkSheet(page)
		.getByRole("textbox", { name: "Price in ₫" })
		.pressSequentially("2990000");
	await linkSheet(page).getByRole("button", { name: "Save" }).click();
	// Then
	await expect(toast(page)).toHaveText("Shop link added");
	await expect(
		page.getByRole("heading", { level: 1, name: "Wool blend jacket" }),
	).toBeVisible();
});

test("shows dots in the price as it is typed", async ({ page }) => {
	// Given: the sheet open
	await onJacketPage(page);
	await page.getByRole("button", { name: "Add a shop link" }).click();
	// When
	const price = linkSheet(page).getByRole("textbox", { name: "Price in ₫" });
	await price.pressSequentially("2990000");
	// Then
	await expect(price).toHaveValue("2.990.000");
});

test("refuses an address without http and a link with no name", async ({
	page,
}) => {
	// Given: the sheet open, the name Shirt
	await onJacketPage(page);
	await page.getByRole("button", { name: "Add a shop link" }).click();
	const dialog = linkSheet(page);
	await dialog.getByRole("textbox", { name: "Name" }).fill("Shirt");
	// When
	await dialog.getByRole("textbox", { name: "Address" }).fill("zara.com/shirt");
	await dialog.getByRole("button", { name: "Save" }).click();
	// Then
	await expect(dialog.getByRole("alert")).toHaveText(
		"Enter a web address that starts with https://.",
	);
	// When
	await dialog
		.getByRole("textbox", { name: "Address" })
		.fill("https://zara.com/shirt");
	await dialog.getByRole("textbox", { name: "Name" }).fill("");
	await dialog.getByRole("button", { name: "Save" }).click();
	// Then
	await expect(dialog.getByRole("alert")).toHaveText("Enter a name.");
	await expect(dialog).toBeVisible();
});

// The Zara link's page, at 2.990.000.
async function onJacketWithLink(page: Page) {
	await page.goto("/");
	const ids = await colourIds(page);
	const wish = await postWish(page, { typeId: "wool", colourId: ids.Charcoal });
	const link = await postShopLink(page, wish, {
		url: ZARA,
		brandId: null,
		name: "Wool blend jacket",
		price: 2990000,
	});
	await page.goto(`/wishlist/link/${link}`);
}

test("changes a shop link", async ({ page }) => {
	// Given
	await onJacketWithLink(page);
	// When
	await page.getByRole("button", { name: "Edit", exact: true }).click();
	const dialog = linkSheet(page, "Edit shop link");
	await dialog.getByRole("textbox", { name: "Price in ₫" }).fill("2490000");
	await dialog.getByRole("button", { name: "Save" }).click();
	// Then
	await expect(toast(page)).toHaveText("Changes saved");
	await expect(fact(page, "Price")).toHaveText("2.490.000 ₫");
});

test("deletes a shop link after its confirm", async ({ page }) => {
	// Given
	await onJacketWithLink(page);
	// When
	await page.getByRole("button", { name: "Edit", exact: true }).click();
	await linkSheet(page, "Edit shop link")
		.getByRole("button", { name: "Delete" })
		.click();
	const confirm = linkSheet(page, "Delete this shop link?");
	// Then
	await expect(confirm).toBeVisible();
	// When
	await confirm.getByRole("button", { name: "Delete" }).click();
	// Then
	await expect(toast(page)).toHaveText("Shop link deleted");
	await expect(page).toHaveURL("/wishlist");
});

test("hides the add card of Other shops at 10 links", async ({ page }) => {
	// Given: a fresh account with a wish holding 10 links
	await page.goto("/");
	const ids = await colourIds(page);
	const wish = await postWish(page, { typeId: "wool", colourId: ids.Charcoal });
	const links: string[] = [];
	for (let i = 1; i <= 10; i++)
		links.push(
			await postShopLink(page, wish, {
				url: `https://shop.example/${i}`,
				brandId: null,
				name: `Link ${i}`,
				price: null,
			}),
		);
	// When
	await page.goto(`/wishlist/link/${links[0]}`);
	// Then
	await expect(
		page.getByRole("button", { name: "Add a shop link" }),
	).toHaveCount(0);
	await expect(
		page.getByText("10 shop links is the limit for one wish."),
	).toBeVisible();
});

test("keeps the shop link sheet open with Not saved when the save fails", async ({
	page,
}) => {
	// Given: the save answers 500
	await page.route("**/api/wishes/*/shop-links", (route) =>
		route.fulfill({ status: 500 }),
	);
	await onJacketPage(page);
	// When
	await page.getByRole("button", { name: "Add a shop link" }).click();
	await linkSheet(page).getByRole("textbox", { name: "Address" }).fill(ZARA);
	await linkSheet(page)
		.getByRole("textbox", { name: "Name" })
		.fill("Wool blend jacket");
	await linkSheet(page).getByRole("button", { name: "Save" }).click();
	// Then
	await expect(linkSheet(page).getByRole("alert")).toHaveText(
		"Not saved. Try again.",
	);
});

test("keeps the cursor after two zeros typed in the middle of the shop link price", async ({
	page,
}) => {
	// Given: a fresh account, Add to wishlist open on an Olive long polo,
	// "123.456" in Price in ₫, the cursor after its first "1"
	await page.goto("/wishlist");
	await openAddSheet(page);
	await pickPiece(page, "Long polo", "Olive");
	const price = addSheet(page).getByRole("textbox", { name: "Price in ₫" });
	await price.pressSequentially("123456");
	await price.evaluate((el: HTMLInputElement) => el.setSelectionRange(1, 1));
	// When
	await price.press("0");
	await price.press("0");
	// Then
	expect({
		value: await price.inputValue(),
		cursor: await price.evaluate((el: HTMLInputElement) => [
			el.selectionStart,
			el.selectionEnd,
		]),
	}).toEqual({ value: "10.023.456", cursor: [4, 4] });
});
