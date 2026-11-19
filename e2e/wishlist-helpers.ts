import type { Page } from "@playwright/test";
import { expect } from "./fixtures";

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
