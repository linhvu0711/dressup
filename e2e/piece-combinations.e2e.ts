import type { Page } from "@playwright/test";
import { postOwnedItems } from "./closet-helpers";
import { colourIds, postCombinations, two } from "./combination-helpers";
import { expect, test } from "./fixtures";

const part = (page: Page) =>
	page.getByRole("region", { name: "Combinations with this piece" });

// Beige chino pants in the closet, five combinations that hold them, saved
// oldest first, and TWO, which does not.
async function seedChinos(page: Page) {
	await page.goto("/");
	const ids = await colourIds(page);
	await postOwnedItems(page, {
		typeId: "chino_p",
		colourId: ids.Beige,
		brandId: null,
		quantity: 1,
	});
	const withChinos = (typeId: string, colourId: string) => ({
		id: crypto.randomUUID(),
		pieces: [
			{ typeId: "chino_p", colourId: ids.Beige },
			{ typeId, colourId },
		],
		open: false,
	});
	await postCombinations(
		page,
		withChinos("tee_s", ids.White),
		withChinos("tee_s", ids.Black),
		withChinos("tee_l", ids.White),
		withChinos("polo_s", ids.Navy),
		withChinos("shirt_l", ids.White),
		two(ids),
	);
	return ids;
}

test("shows four combinations that hold the piece, newest first", async ({
	page,
}) => {
	// Given: both projects, a fresh account with the chinos above
	const ids = await seedChinos(page);
	// When
	await page.goto(`/piece/chino_p/${ids.Beige}`);
	// Then
	await expect(
		part(page).locator('[data-slot="combination-title"]'),
	).toHaveText([
		"White long button-up + Beige chino pants",
		"Navy short polo + Beige chino pants",
		"White long tee + Beige chino pants",
		"Black short tee + Beige chino pants",
	]);
});

test("opens the wall with the piece in the filter from See all", async ({
	page,
}) => {
	// Given: both projects, a fresh account with the chinos above
	const ids = await seedChinos(page);
	await page.goto(`/piece/chino_p/${ids.Beige}`);
	// When
	await part(page).getByRole("link", { name: "See all 5" }).click();
	// Then
	await expect(page).toHaveURL(`/combinations?piece=chino_p.${ids.Beige}`);
});

test("shows no Combinations with this piece for a piece in no combination", async ({
	page,
}) => {
	// Given: both projects, a fresh account with Olive chino shorts in the
	// closet and TWO, which does not hold them
	await page.goto("/");
	const ids = await colourIds(page);
	await postOwnedItems(page, {
		typeId: "chino_sh",
		colourId: ids.Olive,
		brandId: null,
		quantity: 1,
	});
	await postCombinations(page, two(ids));
	// When
	await page.goto(`/piece/chino_sh/${ids.Olive}`);
	// Then
	await expect(
		page.getByRole("heading", { name: "In your closet" }),
	).toBeVisible();
	await expect(
		page.getByRole("heading", { name: "Combinations with this piece" }),
	).toHaveCount(0);
});
