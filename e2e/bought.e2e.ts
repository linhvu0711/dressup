import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { colourIds } from "./label-helpers";
import { sheet, toast } from "./locators";
import { pickFiles, pngFile, uploadPng } from "./picture-helpers";
import { postShopLink, postWish } from "./wishlist-helpers";

const linkSheet = (page: Page, name = "Add a shop link") => sheet(page, name);

const slot = (page: Page, n: number) =>
	page.getByRole("listitem", { name: `Picture ${n}`, exact: true });

const COS = "https://www.cos.com/jacket";

// A fresh account with a Charcoal wool jacket wish, on its own page, or on
// its first shop link's page when it has links.
async function onJacketPage(page: Page, links: { pictures: number }[] = []) {
	await page.goto("/");
	const ids = await colourIds(page);
	const wish = await postWish(page, { typeId: "wool", colourId: ids.Charcoal });
	const linkIds: string[] = [];
	for (const [i, { pictures }] of links.entries()) {
		const pictureIds: string[] = [];
		for (let n = 0; n < pictures; n++) pictureIds.push(await uploadPng(page));
		const link = await postShopLink(page, wish, {
			url: i === 0 ? COS : "https://www.zara.com/x",
			brandId: null,
			name: i === 0 ? "Wool jacket" : "Wool blend jacket",
			price: null,
			pictureIds,
		});
		linkIds.push(link);
	}
	await page.goto(
		linkIds[0] ? `/wishlist/link/${linkIds[0]}` : `/wishlist/wish/${wish}`,
	);
	await expect(
		page.getByRole("heading", {
			level: 1,
			name: linkIds[0] ? "Wool jacket" : "Charcoal wool jacket",
		}),
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
	await page.getByRole("button", { name: "Edit", exact: true }).click();
	// Then
	const dialog = linkSheet(page, "Edit shop link");
	await expect(
		dialog.getByRole("button", { name: "Add pictures" }),
	).toHaveCount(0);
	await expect(
		dialog.getByText("8 pictures is the limit for one item."),
	).toBeVisible();
});

const confirm = (page: Page) =>
	page.getByRole("alertdialog", { name: "Bought this one?" });

const boughtButton = (page: Page) =>
	page.getByRole("button", { name: "Bought", exact: true });

// Bought on the shop link's page, then Bought in the confirm.
async function buy(page: Page) {
	await boughtButton(page).click();
	await confirm(page).getByRole("button", { name: "Bought" }).click();
}

test("opens the Bought confirm and keeps the wish on Cancel", async ({
	page,
}) => {
	// Given
	await onJacketPage(page, [{ pictures: 2 }]);
	// When
	await boughtButton(page).click();
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
		page.getByRole("heading", { level: 1, name: "Wool jacket" }),
	).toBeVisible();
});

test("goes back to the Wishlist when another tab bought the link first", async ({
	page,
}) => {
	// Given
	await onJacketPage(page, [{ pictures: 1 }]);
	const res = await page.request.get("/api/wishes");
	const { wishes } = (await res.json()) as {
		wishes: { shopLinks: { id: string }[] }[];
	};
	const linkId = wishes[0]?.shopLinks[0]?.id;
	expect(
		(await page.request.post(`/api/shop-links/${linkId}/bought`)).status(),
	).toBe(201);
	// When
	await buy(page);
	// Then
	await expect(confirm(page)).toHaveCount(0);
	await expect(page).toHaveURL("/wishlist");
});
