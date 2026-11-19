import type { Locator, Page } from "@playwright/test";
import { colourIds, isPhone, pick } from "./combination-helpers";
import { expect, test } from "./fixtures";
import { postWish } from "./wishlist-helpers";

const PHONE_ONLY = "phone layout only";

const fontSize = (box: Locator) =>
	box.evaluate((el) => getComputedStyle(el).fontSize);

const fontSizes = (boxes: Locator[]) => Promise.all(boxes.map(fontSize));

async function openBrandSheet(page: Page) {
	await page.goto("/labels");
	await page.getByRole("tab", { name: "Brands" }).click();
	await page.getByRole("button", { name: "Add a brand" }).click();
	return page
		.getByRole("dialog", { name: "New brand" })
		.getByRole("textbox", { name: "Name" });
}

test("shows the brand Name box text at 16px on a phone", async ({ page }) => {
	test.skip(!isPhone(page), PHONE_ONLY);
	// Given: the phone project, a fresh account
	// When
	const name = await openBrandSheet(page);
	// Then
	expect(await fontSize(name)).toBe("16px");
});

test("shows the tag Name box text at 16px on a phone", async ({ page }) => {
	test.skip(!isPhone(page), PHONE_ONLY);
	// Given: the phone project, a fresh account
	// When
	await page.goto("/labels");
	await page.getByRole("tab", { name: "Tags" }).click();
	await page.getByRole("button", { name: "Add a tag" }).click();
	// Then
	expect(
		await fontSize(
			page.getByRole("dialog").getByRole("textbox", { name: "Name" }),
		),
	).toBe("16px");
});

test("keeps the brand Name box text at 14px on a laptop", async ({ page }) => {
	test.skip(isPhone(page), "laptop layout only");
	// Given: the laptop project, a fresh account
	// When
	const name = await openBrandSheet(page);
	// Then
	expect(await fontSize(name)).toBe("14px");
});

test.describe("on a wide touch screen", () => {
	test.use({ hasTouch: true });

	test("shows the brand Name box text at 16px on a wide touch screen", async ({
		page,
	}) => {
		test.skip(isPhone(page), "laptop width only");
		// Given: the laptop width with a touch screen, as an iPhone Pro Max in
		// landscape or an iPad, a fresh account
		// When
		const name = await openBrandSheet(page);
		// Then
		expect(await fontSize(name)).toBe("16px");
	});
});

test("keeps pinch zoom allowed in the viewport tag", async ({ page }) => {
	// Given: either project, a fresh account
	// When
	await page.goto("/");
	const content =
		(await page.locator('meta[name="viewport"]').getAttribute("content")) ?? "";
	const zoomLocks = content
		.split(",")
		.map((token) => token.split("=")[0].trim())
		.filter((key) => key === "maximum-scale" || key === "user-scalable");
	// Then
	expect(zoomLocks).toEqual([]);
});

test("shows the colour sheet boxes text at 16px on a phone", async ({
	page,
}) => {
	test.skip(!isPhone(page), PHONE_ONLY);
	// Given: the phone project, a fresh account
	// When
	await page.goto("/labels");
	await page.getByRole("button", { name: "Add a colour" }).click();
	const sheet = page.getByRole("dialog");
	// Then
	expect(
		await fontSizes([
			sheet.getByRole("textbox", { name: "Name" }),
			sheet.getByRole("textbox", { name: "Colour code" }),
		]),
	).toEqual(["16px", "16px"]);
});

test("shows the Quantity box text at 16px on a phone", async ({ page }) => {
	test.skip(!isPhone(page), PHONE_ONLY);
	// Given: the phone project, a fresh account
	// When
	await page.goto("/closet");
	await page
		.getByRole("button", { name: "Add to closet", exact: true })
		.first()
		.click();
	// Then
	expect(
		await fontSize(
			page
				.getByRole("dialog", { name: "Add to closet" })
				.getByRole("textbox", { name: "Quantity" }),
		),
	).toBe("16px");
});

test("shows the shop link boxes text at 16px on a phone", async ({ page }) => {
	test.skip(!isPhone(page), PHONE_ONLY);
	// Given: the phone project, a Charcoal wool jacket wish
	await page.goto("/");
	const ids = await colourIds(page);
	await postWish(page, { typeId: "wool", colourId: ids.Charcoal });
	// When
	await page.goto(`/piece/wool/${ids.Charcoal}`);
	await page.getByRole("button", { name: "Add a shop link" }).click();
	const sheet = page.getByRole("dialog", { name: "Add a shop link" });
	// Then
	expect(
		await fontSizes([
			sheet.getByRole("textbox", { name: "Address" }),
			sheet.getByRole("textbox", { name: "Name" }),
			sheet.getByRole("textbox", { name: "Price in ₫" }),
		]),
	).toEqual(["16px", "16px", "16px"]);
});

test("shows the New tag box text at 16px on a phone", async ({ page }) => {
	test.skip(!isPhone(page), PHONE_ONLY);
	// Given: the phone project, a fresh account, the save dialog open on
	// Navy casual pants and Black long tee
	await page.goto("/build");
	await pick(page, "Bottom", "Casual pants", "Navy");
	await pick(page, "Inner top", "Long tee", "Black");
	await page.getByRole("button", { name: "Save" }).click();
	const dialog = page.getByRole("dialog", { name: "Save combination" });
	// When
	await dialog.getByRole("button", { name: "+ New tag" }).click();
	// Then
	expect(await fontSize(dialog.getByRole("textbox", { name: "New tag" }))).toBe(
		"16px",
	);
});
