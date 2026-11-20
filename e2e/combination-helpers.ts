import { expect, type Page } from "@playwright/test";

export const isPhone = (page: Page) => (page.viewportSize()?.width ?? 0) < 900;

// Every e2e account shares one database, so each saved combination gets its
// own id.
// Khaki Harrington jacket + Black long tee + Navy casual pants.
export const three = (ids: Record<string, string>) => ({
	id: crypto.randomUUID(),
	pieces: [
		{ typeId: "harrington", colourId: ids.Khaki },
		{ typeId: "tee_l", colourId: ids.Black },
		{ typeId: "casual_p", colourId: ids.Navy },
	],
});

// White short tee + Grey training shorts.
export const two = (ids: Record<string, string>) => ({
	id: crypto.randomUUID(),
	pieces: [
		{ typeId: "train_sh", colourId: ids.Grey },
		{ typeId: "tee_s", colourId: ids.White },
	],
});

export async function postCombinations(page: Page, ...bodies: unknown[]) {
	for (const body of bodies) {
		const res = await page.request.post("/api/combinations", { data: body });
		expect(res.status()).toBe(201);
	}
}

export const typeChip = (page: Page, name: string) =>
	page
		.getByRole("radiogroup", { name: "Type" })
		.getByRole("radio", { name, exact: true });

export const swatch = (page: Page, name: string) =>
	page
		.getByRole("radiogroup", { name: "Colour" })
		.getByRole("radio", { name, exact: true });

// Picks a type in a layer, then a colour.
export async function pick(
	page: Page,
	layer: string,
	type: string,
	colour: string,
) {
	await page.getByRole("tab", { name: layer, exact: true }).click();
	await typeChip(page, type).click();
	await swatch(page, colour).click();
}
