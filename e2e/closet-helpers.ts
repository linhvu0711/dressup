import type { Page } from "@playwright/test";
import { expect } from "./fixtures";

// Every e2e account shares one database, so each owned item gets its own id.
export async function postOwnedItems(
	page: Page,
	...bodies: {
		typeId: string;
		colourId: string;
		brandId: string | null;
		quantity: number;
		pictureIds?: string[];
	}[]
) {
	for (const body of bodies) {
		const res = await page.request.post("/api/owned-items", {
			data: { id: crypto.randomUUID(), ...body },
		});
		expect(res.status()).toBe(201);
	}
}
