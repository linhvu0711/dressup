import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const dialog = (page: Page) => page.getByRole("dialog", { name: "Save look" });

const nameBox = (page: Page) =>
	page.getByRole("textbox", { name: "Name (you can leave it empty)" });

async function openDress(page: Page) {
	await page.goto("/");
	await expect(
		page.locator('svg[aria-label="Mannequin in Polo + sweater"]'),
	).toBeVisible();
}

type StoredLook = {
	id: string;
	name: string;
	modeId: string;
	colours: Record<string, string>;
	open: string[];
};

const storedLooks = async (page: Page) =>
	(await (await page.request.get("/api/looks")).json()) as {
		looks: StoredLook[];
	};

test("opens the save form from the bookmark button", async ({ page }) => {
	// Given: both projects, a fresh account, the Dress page shown
	await openDress(page);
	// When
	await page.getByRole("button", { name: "Save look" }).click();
	// Then
	await expect(dialog(page)).toBeVisible();
	await expect(nameBox(page)).toHaveAttribute("placeholder", "Polo + sweater");
	await expect(
		dialog(page).getByRole("button", { name: "Cancel", exact: true }),
	).toBeVisible();
	await expect(
		dialog(page).getByRole("button", { name: "Save", exact: true }),
	).toBeVisible();
});

test("stores nothing on Cancel, Esc, or a click outside", async ({ page }) => {
	// Given: both projects, the Dress page shown
	await openDress(page);
	const closers = [
		() => dialog(page).getByRole("button", { name: "Cancel" }).click(),
		() => page.keyboard.press("Escape"),
		() => page.mouse.click(5, 5),
	];
	for (const close of closers) {
		// When
		await page.getByRole("button", { name: "Save look" }).click();
		await nameBox(page).fill("Gone");
		await close();
		// Then
		await expect(dialog(page)).toHaveCount(0);
	}
	expect(await storedLooks(page)).toEqual({ looks: [] });
});

test("saves a look and shows the toast", async ({ page }) => {
	// Given: both projects, the Dress page shown
	await openDress(page);
	// When
	await page.getByRole("button", { name: "Save look" }).click();
	await nameBox(page).fill("Navy day");
	await dialog(page).getByRole("button", { name: "Save", exact: true }).click();
	// Then
	await expect(page.locator('[data-slot="toast"]')).toHaveText(
		"Saved to Looks",
	);
	await expect(dialog(page)).toHaveCount(0);
	const { looks } = await storedLooks(page);
	expect(looks.map(({ id: _, ...look }) => look)).toEqual([
		{
			name: "Navy day",
			modeId: "polo-sweater",
			colours: { chino_p: "#C9B38C", polo_l: "#F3F1EC", sweater: "#1F3A5F" },
			open: [],
		},
	]);
});

test("keeps the form open when saving fails", async ({ page }) => {
	// Given: both projects, the Dress page shown, each save answered 500
	await openDress(page);
	await page.route("**/api/looks", (route) =>
		route.request().method() === "POST"
			? route.fulfill({ status: 500 })
			: route.continue(),
	);
	// When
	await page.getByRole("button", { name: "Save look" }).click();
	await nameBox(page).fill("Navy day");
	await dialog(page).getByRole("button", { name: "Save", exact: true }).click();
	// Then
	await expect(dialog(page)).toContainText("Not saved. Try again.");
	await expect(nameBox(page)).toHaveValue("Navy day");
});

test("shows the sign-in screen when the save answers 401", async ({ page }) => {
	// Given: both projects, the Dress page shown; then the session is gone
	// for the session check and for each save
	await openDress(page);
	const noSession = { status: 401, json: { error: "unauthorized" } };
	await page.route("/api/me", (route) => route.fulfill(noSession));
	await page.route("**/api/looks", (route) => route.fulfill(noSession));
	// When
	await page.getByRole("button", { name: "Save look" }).click();
	await dialog(page).getByRole("button", { name: "Save", exact: true }).click();
	// Then
	await expect(
		page.getByRole("button", { name: "Sign in with Google" }),
	).toBeVisible();
});
