import { expect, type Page } from "@playwright/test";
import { postOwnedItems } from "./closet-helpers";
import { colourIds } from "./label-helpers";
import { postWish } from "./wishlist-helpers";

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

// Khaki Harrington jacket + Grey sweater + Black long tee + Navy
// casual pants. The closet has the jacket and the tee; the wishlist has the
// jacket and the sweater. So the jacket shows both marks, the sweater Want,
// the tee Own, and the pants none.
export async function markedFour(page: Page) {
	await page.goto("/");
	const ids = await colourIds(page);
	const id = crypto.randomUUID();
	await postCombinations(page, {
		id,
		pieces: [
			{ typeId: "harrington", colourId: ids.Khaki },
			{ typeId: "sweater", colourId: ids.Grey },
			{ typeId: "tee_l", colourId: ids.Black },
			{ typeId: "casual_p", colourId: ids.Navy },
		],
	});
	await postOwnedItems(
		page,
		{ typeId: "tee_l", colourId: ids.Black, brandId: null, quantity: 1 },
		{ typeId: "harrington", colourId: ids.Khaki, brandId: null, quantity: 1 },
	);
	const sweaterWish = await postWish(page, {
		typeId: "sweater",
		colourId: ids.Grey,
	});
	await postWish(page, { typeId: "harrington", colourId: ids.Khaki });
	return { id, ids, sweaterWish };
}
