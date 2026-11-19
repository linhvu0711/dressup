import type { Locator, Page } from "@playwright/test";
import { isPhone } from "./combination-helpers";
import { expect, test } from "./fixtures";

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
