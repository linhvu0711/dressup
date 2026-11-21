import type { Page } from "@playwright/test";
import { isPhone, postCombinations } from "./combination-helpers";
import { expect, test } from "./fixtures";
import { colourIds } from "./label-helpers";
import { sheet, toast } from "./locators";
import {
	jacketAndPolo,
	poloWithLink,
	postShopLink,
	postWish,
} from "./wishlist-helpers";

const wishCards = (page: Page) => page.locator('[data-slot="wish-card"]');

const chips = (page: Page) => page.locator('[data-slot="filter-chip"]');

const title = (page: Page) => page.getByRole("heading", { level: 1 });

test("opens a shop link's page from its card, and Back keeps the filter", async ({
	page,
}) => {
	// Given: the jacket with its two links and the polo; the Wishlist
	// filtered by COS
	const { cos, cosLink } = await jacketAndPolo(page);
	await page.goto(`/wishlist?brand=${cos}`);
	// When
	await page
		.getByRole("link", {
			name: "Single-breasted wool jacket, COS · Charcoal wool jacket",
		})
		.click();
	await expect(title(page)).toHaveText("Single-breasted wool jacket");
	const opened = {
		page: new URL(page.url()).pathname,
		title: await title(page).textContent(),
	};
	await page.getByRole("link", { name: "Back" }).click();
	await expect(wishCards(page)).toHaveCount(1);
	// Then
	expect({
		...opened,
		back: `${new URL(page.url()).pathname}${new URL(page.url()).search}`,
		chips: await chips(page).allTextContents(),
		cards: await wishCards(page).count(),
	}).toEqual({
		page: `/wishlist/link/${cosLink}`,
		title: "Single-breasted wool jacket",
		back: `/wishlist?brand=${cos}`,
		chips: ["COS"],
		cards: 1,
	});
});

test("shows a placeholder while a shop link page loads", async ({ page }) => {
	// Given: a wish with one link "Polo"; GET /api/wishes held until the
	// test lets it go
	const { link } = await poloWithLink(page);
	let release = () => {};
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	await page.route("**/api/wishes", async (route) => {
		await held;
		await route.continue();
	});
	// When
	await page.goto(`/wishlist/link/${link}`);
	await expect(page.locator('[data-slot="item-skeleton"]')).toHaveCount(1);
	const loading = await page.locator('[data-slot="item-skeleton"]').count();
	release();
	await expect(title(page)).toHaveText("Polo");
	// Then
	expect({ loading, title: await title(page).textContent() }).toEqual({
		loading: 1,
		title: "Polo",
	});
});

test("goes back to the wishlist from a shop link or a wish that is gone", async ({
	page,
}) => {
	// Given: an Olive long polo wish holding one link "Polo"; its link page
	// open; then the wish deleted elsewhere
	const { wish, link } = await poloWithLink(page);
	await page.goto(`/wishlist/link/${link}`);
	await expect(title(page)).toHaveText("Polo");
	await page.request.delete(`/api/wishes/${wish}`);
	// When: the tab comes back into view until a load sees the delete; a load
	// still running when the tab comes back is joined, not sent again
	// Then
	await expect(async () => {
		await page.evaluate(() =>
			document.dispatchEvent(new Event("visibilitychange", { bubbles: true })),
		);
		await expect(page).toHaveURL("/wishlist", { timeout: 1000 });
	}).toPass();
});

const actions = (page: Page) => page.getByRole("group", { name: "Actions" });

test("shows a shop link's actions and facts", async ({ page }) => {
	// Given: the COS link's page open
	const { cosLink } = await jacketAndPolo(page);
	await page.goto(`/wishlist/link/${cosLink}`);
	await expect(title(page)).toHaveText("Single-breasted wool jacket");
	// When
	const open = actions(page).getByRole("link", { name: "Open shop" });
	const facts = await page
		.locator('[data-slot="facts"] > div')
		.evaluateAll((rows) =>
			rows.map((row) => [
				row.querySelector("dt")?.textContent,
				row.querySelector("dd")?.textContent,
			]),
		);
	// Then
	expect({
		actions: await actions(page)
			.locator("a, button")
			.evaluateAll((els) => els.map((el) => el.getAttribute("aria-label"))),
		facts,
		open: {
			href: await open.getAttribute("href"),
			target: await open.getAttribute("target"),
			rel: await open.getAttribute("rel"),
		},
	}).toEqual({
		actions: ["Open shop", "Bought", "Edit", "Remove from wishlist"],
		facts: [
			["Shop", "COS"],
			["Type", "Wool jacket"],
			["Colour", "Charcoal"],
			["Price", "4.290.000 ₫"],
			["Address", "cos.com"],
		],
		open: {
			href: "https://www.cos.com/a",
			target: "_blank",
			rel: "noopener noreferrer",
		},
	});
});

test("shows Could not load your wishlist on a shop link page and loads on Retry", async ({
	page,
}) => {
	// Given: a wish with one link "Polo"; the first GET /api/wishes answers
	// 500, the next passes on
	const { link } = await poloWithLink(page);
	let failed = false;
	await page.route("**/api/wishes", (route) => {
		if (failed || route.request().method() !== "GET") return route.continue();
		failed = true;
		return route.fulfill({ status: 500 });
	});
	// When
	await page.goto(`/wishlist/link/${link}`);
	// Then
	await expect(
		page.getByRole("heading", { name: "Could not load your wishlist" }),
	).toBeVisible();
	// When
	await page.getByRole("button", { name: "Retry" }).click();
	// Then
	await expect(title(page)).toHaveText("Polo");
});

test("lists the other shops of the wish with an add card", async ({ page }) => {
	// Given: the COS link's page open
	const { cosLink } = await jacketAndPolo(page);
	await page.goto(`/wishlist/link/${cosLink}`);
	await expect(title(page)).toHaveText("Single-breasted wool jacket");
	// When
	const others = await page
		.locator('[data-slot="other-shop"]')
		.evaluateAll((links) => links.map((l) => l.getAttribute("aria-label")));
	await page.getByRole("button", { name: "Add a shop link" }).click();
	await expect(sheet(page)).toBeVisible();
	// Then
	expect({
		others,
		sheet: await sheet(page).getByRole("heading").first().textContent(),
	}).toEqual({
		others: ["Zara jacket, zara.com · Charcoal wool jacket"],
		sheet: "Add a shop link",
	});
});

test("hides Other shops for a wish with one link", async ({ page }) => {
	// Given: a wish with one link "Polo"; its page open
	const { link } = await poloWithLink(page);
	await page.goto(`/wishlist/link/${link}`);
	await expect(title(page)).toHaveText("Polo");
	// When
	const sections = await page
		.getByRole("heading", { name: "Other shops for this wish" })
		.count();
	// Then
	expect(sections).toBe(0);
});

test("shows five combinations with the piece on a wide screen and four on a phone", async ({
	page,
}) => {
	// Given: six combinations that hold the Charcoal wool jacket, each with a
	// White top of another type; a Charcoal wool jacket wish with one link;
	// its page open
	await page.goto("/");
	const ids = await colourIds(page);
	await postCombinations(
		page,
		...["tee_s", "tee_l", "polo_s", "polo_l", "shirt_s", "shirt_l"].map(
			(typeId) => ({
				id: crypto.randomUUID(),
				pieces: [
					{ typeId: "wool", colourId: ids.Charcoal },
					{ typeId, colourId: ids.White },
				],
			}),
		),
	);
	const wish = await postWish(page, { typeId: "wool", colourId: ids.Charcoal });
	const link = await postShopLink(page, wish, {
		url: "https://www.cos.com/a",
		brandId: null,
		name: "Wool coat",
		price: null,
	});
	await page.goto(`/wishlist/link/${link}`);
	const part = page.getByRole("region", {
		name: "Combinations with this piece",
	});
	await expect(part.getByRole("link", { name: /^See all/ })).toBeVisible();
	// When
	const titles = part.locator('[data-slot="combination-title"]');
	let cards = 0;
	for (const t of await titles.all()) if (await t.isVisible()) cards++;
	// Then
	expect({
		cards,
		seeAll: await part.getByRole("link", { name: /^See all/ }).textContent(),
	}).toEqual({ cards: isPhone(page) ? 4 : 5, seeAll: "See all 6" });
});

const confirm = (page: Page) => page.getByRole("alertdialog");

test("removes one shop link after its confirm and keeps the wish", async ({
	page,
}) => {
	// Given: the COS link's page open
	const { cosLink } = await jacketAndPolo(page);
	await page.goto(`/wishlist/link/${cosLink}`);
	await expect(title(page)).toHaveText("Single-breasted wool jacket");
	// When
	await actions(page)
		.getByRole("button", { name: "Remove from wishlist" })
		.click();
	const text = await confirm(page).locator("p").textContent();
	await confirm(page).getByRole("button", { name: "Remove" }).click();
	await expect(page).toHaveURL("/wishlist");
	await expect(wishCards(page)).toHaveCount(2);
	// Then
	expect({
		confirm: text,
		url: new URL(page.url()).pathname,
		cards: await wishCards(page).evaluateAll((links) =>
			links.map((l) => l.getAttribute("aria-label")),
		),
	}).toEqual({
		confirm: "Only this shop link goes. The wish keeps its other shop links.",
		url: "/wishlist",
		cards: [
			"Olive long polo, No shop link yet",
			"Zara jacket, zara.com · Charcoal wool jacket",
		],
	});
});

test("removes the last shop link and its wish", async ({ page }) => {
	// Given: one Olive long polo wish holding one link "Polo"; its page open
	const { link } = await poloWithLink(page);
	await page.goto(`/wishlist/link/${link}`);
	await expect(title(page)).toHaveText("Polo");
	// When
	await actions(page)
		.getByRole("button", { name: "Remove from wishlist" })
		.click();
	const text = await confirm(page).locator("p").textContent();
	await confirm(page).getByRole("button", { name: "Remove" }).click();
	const empty = page.getByRole("heading", {
		name: "Nothing on your wishlist yet",
	});
	await expect(empty).toBeVisible();
	// Then
	expect({
		confirm: text,
		url: new URL(page.url()).pathname,
		empty: await empty.textContent(),
	}).toEqual({
		confirm: "This is the last shop link, so the wish goes too.",
		url: "/wishlist",
		empty: "Nothing on your wishlist yet",
	});
});

test("warns in the edit sheet when the shop link is the last one", async ({
	page,
}) => {
	// Given: the one-link account with the link's brand COS; its page open
	const { link } = await poloWithLink(page, "COS");
	await page.goto(`/wishlist/link/${link}`);
	await expect(title(page)).toHaveText("Polo");
	// When
	await actions(page).getByRole("button", { name: "Edit" }).click();
	await sheet(page, "Edit shop link")
		.getByRole("button", { name: "Delete" })
		.click();
	// Then
	await expect(sheet(page, "Delete this shop link?")).toContainText(
		"COS · Polo. This is the last shop link, so the wish goes too.",
	);
});

test("keeps the shop link page when the remove fails", async ({ page }) => {
	// Given: the one-link account; DELETE /api/shop-links/* answers 500
	const { link } = await poloWithLink(page);
	await page.route("**/api/shop-links/*", (route) =>
		route.request().method() === "DELETE"
			? route.fulfill({ status: 500 })
			: route.continue(),
	);
	await page.goto(`/wishlist/link/${link}`);
	await expect(title(page)).toHaveText("Polo");
	// When
	await actions(page)
		.getByRole("button", { name: "Remove from wishlist" })
		.click();
	await confirm(page).getByRole("button", { name: "Remove" }).click();
	await expect(toast(page)).toBeVisible();
	// Then
	expect({
		toast: await toast(page).textContent(),
		title: await title(page).textContent(),
	}).toEqual({ toast: "Not removed. Try again.", title: "Polo" });
});

const buy = async (page: Page) => {
	await actions(page).getByRole("button", { name: "Bought" }).click();
	await confirm(page).getByRole("button", { name: "Bought" }).click();
};

test("opens the piece page of the bought item after Bought", async ({
	page,
}) => {
	// Given: the COS link's page open
	const { ids, cosLink } = await jacketAndPolo(page);
	await page.goto(`/wishlist/link/${cosLink}`);
	await expect(title(page)).toHaveText("Single-breasted wool jacket");
	// When
	await buy(page);
	await expect(page).toHaveURL(`/piece/wool/${ids.Charcoal}`);
	const closet = page.getByRole("heading", { name: "In your closet" });
	await expect(closet).toBeVisible();
	// Then
	expect({
		url: new URL(page.url()).pathname,
		title: await title(page).textContent(),
		closet: await closet.textContent(),
		toast: await toast(page).textContent(),
	}).toEqual({
		url: `/piece/wool/${ids.Charcoal}`,
		title: "Charcoal wool jacket",
		closet: "In your closet",
		toast: "Moved to your closet",
	});
});

test("says the closet limit when Bought answers owned_item_limit", async ({
	page,
}) => {
	// Given: the one-link account; Bought answers 409 owned_item_limit
	const { link } = await poloWithLink(page);
	await page.route("**/api/shop-links/*/bought", (route) =>
		route.fulfill({ status: 409, json: { error: "owned_item_limit" } }),
	);
	await page.goto(`/wishlist/link/${link}`);
	await expect(title(page)).toHaveText("Polo");
	// When
	await buy(page);
	// Then
	await expect(confirm(page).getByRole("alert")).toHaveText(
		"You have 500 items. That is the limit. Delete one to add a new one.",
	);
	// The open confirm hides the page from roles, so the title goes by its tag.
	await expect(page.locator("h1")).toHaveText("Polo");
});

test("keeps the dialog open with Not saved when Bought fails", async ({
	page,
}) => {
	// Given: the one-link account; Bought answers 500
	const { link } = await poloWithLink(page);
	await page.route("**/api/shop-links/*/bought", (route) =>
		route.fulfill({ status: 500 }),
	);
	await page.goto(`/wishlist/link/${link}`);
	await expect(title(page)).toHaveText("Polo");
	// When
	await buy(page);
	// Then
	await expect(confirm(page).getByRole("alert")).toHaveText(
		"Not saved. Try again.",
	);
});

// A fresh account with an Olive long polo wish and no link, on its page.
async function onPoloWishPage(page: Page) {
	await page.goto("/");
	const ids = await colourIds(page);
	await postWish(page, { typeId: "polo_l", colourId: ids.Olive });
	await page.goto("/wishlist");
	await page
		.getByRole("link", { name: "Olive long polo, No shop link yet" })
		.click();
	await expect(title(page)).toHaveText("Olive long polo");
}

test("shows a wish with no shop link on its own page", async ({ page }) => {
	// Given: an Olive long polo wish and no link; /wishlist open
	// When
	await onPoloWishPage(page);
	// Then
	expect({
		title: await title(page).textContent(),
		note: await page.getByText("No shop link yet.").textContent(),
		facts: await page
			.locator('[data-slot="facts"] > div')
			.evaluateAll((rows) =>
				rows.map((row) => [
					row.querySelector("dt")?.textContent,
					row.querySelector("dd")?.textContent,
				]),
			),
		buttons: await page
			.getByRole("main")
			.getByRole("button")
			.filter({ hasText: /^(Add a shop link|Remove from wishlist)$/ })
			.allTextContents(),
		drawing: await page.locator("main svg:not(.lucide)").count(),
	}).toEqual({
		title: "Olive long polo",
		note: "No shop link yet.",
		facts: [
			["Type", "Long polo"],
			["Colour", "Olive"],
		],
		buttons: ["Add a shop link", "Remove from wishlist"],
		drawing: 1,
	});
});

test("removes a wish with no shop link after its confirm", async ({ page }) => {
	// Given: that wish's page open
	await onPoloWishPage(page);
	// When
	await page.getByRole("button", { name: "Remove from wishlist" }).click();
	const text = await confirm(page).locator("p").textContent();
	await confirm(page).getByRole("button", { name: "Remove" }).click();
	const empty = page.getByRole("heading", {
		name: "Nothing on your wishlist yet",
	});
	await expect(empty).toBeVisible();
	// Then
	expect({
		confirm: text,
		url: new URL(page.url()).pathname,
		empty: await empty.textContent(),
	}).toEqual({
		confirm: "It has no shop link.",
		url: "/wishlist",
		empty: "Nothing on your wishlist yet",
	});
});

test("opens the new link's page after a link is added to a wish with none", async ({
	page,
}) => {
	// Given: that wish's page open
	await onPoloWishPage(page);
	// When
	await page.getByRole("button", { name: "Add a shop link" }).click();
	const add = sheet(page, "Add a shop link");
	await add
		.getByRole("textbox", { name: "Address" })
		.fill("https://shop.example/polo");
	await add.getByRole("textbox", { name: "Name" }).fill("Olive polo");
	await add.getByRole("button", { name: "Save" }).click();
	// Then
	await expect(title(page)).toHaveText("Olive polo");
	await expect(page).toHaveURL(/\/wishlist\/link\//);
});
