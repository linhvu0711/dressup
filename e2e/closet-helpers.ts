import type { Page } from "@playwright/test";
import { expect } from "./fixtures";

// Every e2e account shares one database, so each owned item gets its own id.
// Gives back the ids in the order it posted them.
export async function postOwnedItems(
	page: Page,
	...bodies: {
		typeId: string;
		colourId: string;
		brandId: string | null;
		quantity: number;
		name?: string;
		price?: number;
		pictureIds?: string[];
	}[]
): Promise<string[]> {
	const ids: string[] = [];
	for (const body of bodies) {
		const id = crypto.randomUUID();
		const res = await page.request.post("/api/owned-items", {
			data: { id, ...body },
		});
		expect(res.status()).toBe(201);
		ids.push(id);
	}
	return ids;
}
