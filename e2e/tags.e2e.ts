import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { card, nameBox, openDress, storedLooks } from "./looks-helpers";

const form = (page: Page, name = "Save look") =>
	page.getByRole("dialog", { name });

const pressed = (page: Page, name = "Save look") =>
	form(page, name).locator('[aria-pressed="true"]');

const storedTags = async (page: Page) =>
	(
		(await (await page.request.get("/api/tags")).json()) as {
			tags: { id: string; name: string }[];
		}
	).tags;

// The tag names of the look, in the order the look holds them.
async function tagsOf(page: Page, lookName: string) {
	const tags = await storedTags(page);
	const look = (await storedLooks(page)).looks.find((l) => l.name === lookName);
	return (look?.tags ?? []).map((id) => tags.find((t) => t.id === id)?.name);
}

async function typeNewTag(page: Page, name: string) {
	await form(page).getByRole("button", { name: "+ New tag" }).click();
	await form(page).getByRole("textbox", { name: "New tag" }).fill(name);
	await page.keyboard.press("Enter");
}

// A tag made in the open save form; it is turned on for the look.
async function newTag(page: Page, name: string) {
	await typeNewTag(page, name);
	await expect(
		pressed(page).filter({ hasText: new RegExp(`^${name}$`) }),
	).toHaveCount(1);
}

// A look saved from the Dress page, with new tags made in its form.
async function saveWithNewTags(page: Page, lookName: string, tags: string[]) {
	await page.getByRole("button", { name: "Save look" }).click();
	for (const tag of tags) await newTag(page, tag);
	await nameBox(page).fill(lookName);
	await form(page).getByRole("button", { name: "Save", exact: true }).click();
	await expect(form(page)).toHaveCount(0);
}

test("adds a new tag in the save form and turns it on", async ({ page }) => {
	// Given: both projects, a fresh account, the Dress page open
	await openDress(page);
	// When
	await page.getByRole("button", { name: "Save look" }).click();
	await typeNewTag(page, "Work");
	// Then
	await expect(pressed(page)).toHaveCount(1);
	expect({
		pressed: await pressed(page).allTextContents(),
		stored: (await storedTags(page)).map((t) => t.name),
	}).toEqual({ pressed: ["Work"], stored: ["Work"] });
});

test("puts two tags on a look in the save form, then takes one off in the edit state", async ({
	page,
}) => {
	// Given: both projects, a fresh account, "Navy" saved with "Work" and
	// "Trip" made in the form and on
	await openDress(page);
	await saveWithNewTags(page, "Navy", ["Work", "Trip"]);
	const before = await tagsOf(page, "Navy");
	// When
	await page.goto("/looks");
	await card(page, "Navy").click();
	await page.getByRole("button", { name: "Edit this look" }).click();
	await page.getByRole("button", { name: "Save changes" }).click();
	await form(page, "Save changes")
		.getByRole("button", { name: "Trip", exact: true })
		.click();
	await form(page, "Save changes")
		.getByRole("button", { name: "Save changes" })
		.click();
	await expect(form(page, "Save changes")).toHaveCount(0);
	// Then
	expect({ before, after: await tagsOf(page, "Navy") }).toEqual({
		before: ["Work", "Trip"],
		after: ["Work"],
	});
});

test("shows the red hint for a name the account has", async ({ page }) => {
	// Given: both projects, a fresh account, tag "Work" made in the form
	await openDress(page);
	await page.getByRole("button", { name: "Save look" }).click();
	await newTag(page, "Work");
	// When
	await typeNewTag(page, "wORK");
	// Then
	const hint = form(page).getByText("You have this tag already");
	await expect(hint).toBeVisible();
	expect({
		hint: await hint.textContent(),
		chips: await form(page)
			.getByRole("toolbar", { name: "Tags" })
			.getByRole("button")
			.allTextContents(),
	}).toEqual({ hint: "You have this tag already", chips: ["Work"] });
});
