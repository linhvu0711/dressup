import { expect, type Page } from "@playwright/test";

export const dialog = (page: Page) =>
	page.getByRole("dialog", { name: "Save look" });

export const nameBox = (page: Page) =>
	page.getByRole("textbox", { name: "Name (you can leave it empty)" });

export async function openDress(page: Page) {
	await page.goto("/");
	await expect(
		page.locator('svg[aria-label="Mannequin in Polo + sweater"]'),
	).toBeVisible();
}

export type StoredLook = {
	id: string;
	name: string;
	modeId: string;
	colours: Record<string, string>;
	open: string[];
	tags: string[];
};

export const storedLooks = async (page: Page) =>
	(await (await page.request.get("/api/looks")).json()) as {
		looks: StoredLook[];
	};

export const isPhone = (page: Page) => (page.viewportSize()?.width ?? 0) < 900;

export async function openColours(page: Page) {
	await openDress(page);
	if (isPhone(page)) {
		await page.getByRole("tab", { name: "Colours", exact: true }).click();
	}
}

export async function saveLook(page: Page, name: string) {
	await page.getByRole("button", { name: "Save look" }).click();
	if (name) await nameBox(page).fill(name);
	await dialog(page).getByRole("button", { name: "Save", exact: true }).click();
	await expect(dialog(page)).toHaveCount(0);
}

export const card = (page: Page, name: string) =>
	page.locator('[data-slot="look-card"]').filter({ hasText: name });
