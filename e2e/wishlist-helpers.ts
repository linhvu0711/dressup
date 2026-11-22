import type { Page } from "@playwright/test";
import { expect } from "./fixtures";
import { colourIds, postBrand } from "./label-helpers";

// Every e2e account shares one database, so each wish gets its own id.
export async function postWish(
	page: Page,
	body: { typeId: string; colourId: string },
): Promise<string> {
	const id = crypto.randomUUID();
	const res = await page.request.post("/api/wishes", {
		data: { id, ...body },
	});
	expect(res.status()).toBe(201);
	return id;
}

export async function postShopLink(
	page: Page,
	wishId: string,
	body: {
		url: string;
		brandId: string | null;
		name: string;
		price: number | null;
		pictureIds?: string[];
	},
): Promise<string> {
	const id = crypto.randomUUID();
	const res = await page.request.post(`/api/wishes/${wishId}/shop-links`, {
		data: { id, ...body },
	});
	expect(res.status()).toBe(201);
	return id;
}

// A fresh account with a COS brand; a Charcoal wool jacket wish with a COS
// link at 4.290.000, then a no-brand link at 588.000; then an Olive long polo
// wish with no link.
export async function jacketAndPolo(page: Page) {
	await page.goto("/");
	const ids = await colourIds(page);
	const cos = await postBrand(page, "COS");
	const jacket = await postWish(page, {
		typeId: "wool",
		colourId: ids.Charcoal,
	});
	const cosLink = await postShopLink(page, jacket, {
		url: "https://www.cos.com/a",
		brandId: cos,
		name: "Single-breasted wool jacket",
		price: 4290000,
	});
	const zaraLink = await postShopLink(page, jacket, {
		url: "https://www.zara.com/b",
		brandId: null,
		name: "Zara jacket",
		price: 588000,
	});
	const polo = await postWish(page, { typeId: "polo_l", colourId: ids.Olive });
	return { ids, cos, jacket, cosLink, zaraLink, polo };
}

// A fresh account with one Olive long polo wish holding one link "Polo",
// of the brand when one is named.
export async function poloWithLink(page: Page, brand?: string) {
	await page.goto("/");
	const ids = await colourIds(page);
	const brandId = brand === undefined ? null : await postBrand(page, brand);
	const wish = await postWish(page, { typeId: "polo_l", colourId: ids.Olive });
	const link = await postShopLink(page, wish, {
		url: "https://shop.example/polo",
		brandId,
		name: "Polo",
		price: 450000,
	});
	return { ids, wish, link };
}
