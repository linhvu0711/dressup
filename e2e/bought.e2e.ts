import type { Page } from "@playwright/test";
import { colourIds } from "./closet-helpers";
import { expect, test } from "./fixtures";
import { pickFiles, pngFile, uploadPng } from "./picture-helpers";
import { postShopLink, postWish } from "./wishlist-helpers";

const linkSheet = (page: Page, name = "Add a shop link") =>
	page.getByRole("dialog", { name });

const toast = (page: Page) => page.locator('[data-slot="toast"]');

const slot = (page: Page, n: number) =>
	page.getByRole("listitem", { name: `Picture ${n}`, exact: true });

const COS = "https://www.cos.com/jacket";

// A fresh account with a Charcoal wool jacket wish, on its piece page.
async function onJacketPage(page: Page, links: { pictures: number }[] = []) {
	await page.goto("/");
	const ids = await colourIds(page);
	const wish = await postWish(page, { typeId: "wool", colourId: ids.Charcoal });
	for (const [i, { pictures }] of links.entries()) {
		const pictureIds: string[] = [];
		for (let n = 0; n < pictures; n++) pictureIds.push(await uploadPng(page));
		await postShopLink(page, wish, {
			url: i === 0 ? COS : "https://www.zara.com/x",
			brandId: null,
			name: i === 0 ? "Wool jacket" : "Wool blend jacket",
			price: null,
			pictureIds,
		});
	}
	await page.goto(`/piece/wool/${ids.Charcoal}`);
	await expect(
		page.getByRole("heading", { name: "On your wishlist" }),
	).toBeVisible();
	return { ids, wish };
}

// The picture ids of each shop link of the account's only wish.
async function linkPictureIds(page: Page): Promise<string[][]> {
	const res = await page.request.get("/api/wishes");
	const { wishes } = (await res.json()) as {
		wishes: { shopLinks: { pictureIds: string[] }[] }[];
	};
	return wishes[0]?.shopLinks.map((l) => l.pictureIds) ?? [];
}

test("adds a picture to a shop link from the sheet", async ({ page }) => {
	// Given
	await onJacketPage(page);
	// When
	await page.getByRole("button", { name: "Add a shop link" }).click();
	await linkSheet(page).getByRole("textbox", { name: "Address" }).fill(COS);
	await linkSheet(page)
		.getByRole("textbox", { name: "Name" })
		.fill("Wool jacket");
	await pickFiles(
		page,
		linkSheet(page).getByRole("button", { name: "Add pictures" }),
		[pngFile("a.png")],
	);
	await linkSheet(page).getByRole("button", { name: "Save" }).click();
	// Then
	await expect(toast(page)).toHaveText("Shop link added");
	expect((await linkPictureIds(page)).map((ids) => ids.length)).toEqual([1]);
});

test("shows Failed and Try again when a link picture upload fails", async ({
	page,
}) => {
	// Given
	await onJacketPage(page);
	await page.route("**/api/pictures", (route) =>
		route.fulfill({ status: 500 }),
	);
	// When
	await page.getByRole("button", { name: "Add a shop link" }).click();
	await pickFiles(
		page,
		linkSheet(page).getByRole("button", { name: "Add pictures" }),
		[pngFile("a.png")],
	);
	// Then
	await expect(slot(page, 1).getByText("Failed")).toBeVisible();
	await expect(
		slot(page, 1).getByRole("button", { name: "Try again" }),
	).toBeVisible();
});

test("stops at 8 pictures on one shop link", async ({ page }) => {
	// Given
	await onJacketPage(page, [{ pictures: 8 }]);
	// When
	await page.getByRole("button", { name: "Change shop link" }).click();
	// Then
	const sheet = linkSheet(page, "Edit shop link");
	await expect(sheet.getByRole("button", { name: "Add pictures" })).toHaveCount(
		0,
	);
	await expect(
		sheet.getByText("8 pictures is the limit for one item."),
	).toBeVisible();
});

const strip = (page: Page, name: string) =>
	page.getByRole("list", { name: `Pictures of ${name}` });

test("shows each shop link's pictures as a strip and opens the viewer", async ({
	page,
}) => {
	// Given
	await onJacketPage(page, [{ pictures: 2 }, { pictures: 0 }]);
	// When
	await expect(strip(page, "cos.com").getByRole("button")).toHaveCount(2);
	const strips = {
		cos: await strip(page, "cos.com").getByRole("button").count(),
		zara: await strip(page, "zara.com").count(),
	};
	await page.getByRole("button", { name: "Open picture 1 of 2" }).click();
	// Then
	expect(strips).toEqual({ cos: 2, zara: 0 });
	await expect(
		page.getByRole("dialog", { name: "Picture 1 of 2" }),
	).toBeVisible();
});

const card = (page: Page) =>
	page.getByRole("listitem", { name: "Wool jacket", exact: true });

const confirm = (page: Page) =>
	page.getByRole("alertdialog", { name: "Bought this one?" });

// Bought on the card, then Bought in the confirm.
async function buy(page: Page) {
	await card(page).getByRole("button", { name: "Bought" }).click();
	await confirm(page).getByRole("button", { name: "Bought" }).click();
}

test("opens the Bought confirm and keeps the wish on Cancel", async ({
	page,
}) => {
	// Given
	await onJacketPage(page, [{ pictures: 2 }]);
	// When
	await card(page).getByRole("button", { name: "Bought" }).click();
	const shown = {
		text: await confirm(page).getByRole("paragraph").first().textContent(),
		buttons: await confirm(page).getByRole("button").allInnerTexts(),
	};
	await confirm(page).getByRole("button", { name: "Cancel" }).click();
	// Then
	expect(shown).toEqual({
		text: "It goes to your closet with its pictures. The wish and its other shop links go away.",
		buttons: ["Cancel", "Bought"],
	});
	await expect(
		page.getByRole("heading", { name: "On your wishlist" }),
	).toBeVisible();
	await expect(card(page)).toBeVisible();
});

test("moves a shop link to the closet after Bought", async ({ page }) => {
	// Given
	const { ids } = await onJacketPage(page, [{ pictures: 2 }]);
	// When
	await buy(page);
	// Then
	await expect(toast(page)).toHaveText("Moved to your closet");
	await expect(
		page.getByRole("heading", { name: "In your closet" }),
	).toBeVisible();
	await expect(
		page.getByRole("button", { name: "No brand × 1" }),
	).toBeVisible();
	await expect(strip(page, "No brand").getByRole("button")).toHaveCount(2);
	await expect(
		page.getByRole("heading", { name: "On your wishlist" }),
	).toHaveCount(0);
	await expect(page).toHaveURL(`/piece/wool/${ids.Charcoal}`);
});

test("keeps the confirm open with Not saved when Bought fails", async ({
	page,
}) => {
	// Given
	await onJacketPage(page, [{ pictures: 2 }]);
	await page.route("**/api/shop-links/*/bought", (route) =>
		route.fulfill({ status: 500 }),
	);
	// When
	await buy(page);
	// Then
	await expect(confirm(page).getByRole("alert")).toHaveText(
		"Not saved. Try again.",
	);
	// The open confirm hides the page from roles, so the card goes by its slot.
	await expect(page.locator('[data-slot="shop-link"]')).toHaveCount(1);
});

test("says the closet limit when Bought answers owned_item_limit", async ({
	page,
}) => {
	// Given
	await onJacketPage(page, [{ pictures: 2 }]);
	await page.route("**/api/shop-links/*/bought", (route) =>
		route.fulfill({ status: 409, json: { error: "owned_item_limit" } }),
	);
	// When
	await buy(page);
	// Then
	await expect(confirm(page).getByRole("alert")).toHaveText(
		"You have 500 items. That is the limit. Delete one to add a new one.",
	);
});
