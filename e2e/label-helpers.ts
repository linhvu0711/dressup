import type { Page } from "@playwright/test";
import { expect } from "./fixtures";

// The account's colour ids by name, through its own session.
export async function colourIds(page: Page): Promise<Record<string, string>> {
	const res = await page.request.get("/api/colours");
	const { colours } = (await res.json()) as {
		colours: { id: string; name: string }[];
	};
	return Object.fromEntries(colours.map((c) => [c.name, c.id]));
}

// Posts a brand and gives back its id.
export async function postBrand(page: Page, name: string): Promise<string> {
	const res = await page.request.post("/api/brands", { data: { name } });
	expect(res.status()).toBe(201);
	return ((await res.json()) as { brand: { id: string } }).brand.id;
}

export async function postTag(page: Page, name: string) {
	const res = await page.request.post("/api/tags", { data: { name } });
	expect(res.status()).toBe(201);
	return ((await res.json()) as { tag: { id: string } }).tag.id;
}
