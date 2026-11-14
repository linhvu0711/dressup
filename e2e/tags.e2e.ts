import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import {
	card,
	isPhone,
	nameBox,
	openDress,
	saveLook,
	storedLooks,
} from "./looks-helpers";

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

test("keeps a chip clicked while a new tag is saved", async ({ page }) => {
	// Given: both projects, a fresh account with tag "Work", the save form
	// open; POST /api/tags held until the test lets it go
	await postTag(page, "Work");
	await openDress(page);
	await page.getByRole("button", { name: "Save look" }).click();
	let release = () => {};
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	await page.route("**/api/tags", async (route) => {
		if (route.request().method() === "POST") await held;
		await route.continue();
	});
	// When
	await typeNewTag(page, "Trip");
	await form(page).getByRole("button", { name: "Work", exact: true }).click();
	release();
	await expect(pressed(page).filter({ hasText: /^Trip$/ })).toHaveCount(1);
	// Then
	expect(await pressed(page).allTextContents()).toEqual(["Work", "Trip"]);
});

test("keeps Save off while a new tag is saved", async ({ page }) => {
	// Given: both projects, a fresh account, the save form open; POST
	// /api/tags held until the test lets it go
	await openDress(page);
	await page.getByRole("button", { name: "Save look" }).click();
	let release = () => {};
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	await page.route("**/api/tags", async (route) => {
		if (route.request().method() === "POST") await held;
		await route.continue();
	});
	// When
	await typeNewTag(page, "Trip");
	// Then
	await expect(
		form(page).getByRole("button", { name: "Save", exact: true }),
	).toBeDisabled();
	release();
});

test("sends a new tag once when Enter is pressed twice", async ({ page }) => {
	// Given: both projects, a fresh account, the save form open; POST
	// /api/tags held until the test lets it go
	await openDress(page);
	await page.getByRole("button", { name: "Save look" }).click();
	let release = () => {};
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	let posts = 0;
	await page.route("**/api/tags", async (route) => {
		if (route.request().method() === "POST") {
			posts += 1;
			await held;
		}
		await route.continue();
	});
	// When
	await typeNewTag(page, "Trip");
	await page.keyboard.press("Enter");
	release();
	await expect(pressed(page).filter({ hasText: /^Trip$/ })).toHaveCount(1);
	// Then
	expect(posts).toBe(1);
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

test("shows the look's tags in the look view", async ({ page }) => {
	// Given: both projects, a fresh account, "Navy" saved with "Work" and
	// "Trip" on
	await openDress(page);
	await saveWithNewTags(page, "Navy", ["Work", "Trip"]);
	// When
	await page.goto("/looks");
	await card(page, "Navy").click();
	// Then
	const tags = page.locator('[data-slot="look-view"] [data-slot="look-tag"]');
	await expect(tags).toHaveCount(2);
	expect(await tags.allTextContents()).toEqual(["Work", "Trip"]);
});

const COLD = {
	modeId: "polo-sweater",
	colours: { chino_p: "#C9B38C", polo_l: "#F3F1EC", sweater: "#1F3A5F" },
};
const HOT = {
	modeId: "tee-casual-shorts",
	colours: { casual_sh: "#C9B38C", tee_s: "#F3F1EC" },
};

async function postTag(page: Page, name: string) {
	const res = await page.request.post("/api/tags", { data: { name } });
	expect(res.status()).toBe(201);
	return ((await res.json()) as { tag: { id: string } }).tag.id;
}

// Each look is stored in order, so the wall shows the last one first.
async function postLook(
	page: Page,
	name: string,
	mode: typeof COLD | typeof HOT,
	tags: string[] = [],
) {
	const res = await page.request.post("/api/looks", {
		data: { id: crypto.randomUUID(), name, open: [], tags, ...mode },
	});
	expect(res.status()).toBe(201);
}

const chips = (page: Page) =>
	page.getByRole("radiogroup", { name: "Filter looks" });

const cards = (page: Page) => page.locator('[data-slot="look-card"]');

async function openLooksPage(page: Page, count: number) {
	await page.goto("/looks");
	await expect(cards(page)).toHaveCount(count);
}

test("shows All, the weather groups, each tag, and the pencil", async ({
	page,
}) => {
	// Given: both projects, a fresh account, tags "Work" and "Trip", one look
	const work = await postTag(page, "Work");
	const trip = await postTag(page, "Trip");
	await postLook(page, "One", COLD, [work, trip]);
	// When
	await openLooksPage(page, 1);
	// Then
	expect({
		radios: await chips(page).getByRole("radio").allTextContents(),
		checked: await chips(page)
			.locator('[aria-checked="true"]')
			.allTextContents(),
		pencil: await page.getByRole("button", { name: "Edit tags" }).count(),
	}).toEqual({
		radios: ["All", "Hot", "Cool", "Cold", "Work", "Trip"],
		checked: ["All"],
		pencil: 1,
	});
});

test("filters the wall by a weather group and by a tag", async ({ page }) => {
	// Given: both projects, a fresh account; "Cold work" with "Work", then
	// "Hot one", then "Hot two" with "Work"
	const work = await postTag(page, "Work");
	await postLook(page, "Cold work", COLD, [work]);
	await postLook(page, "Hot one", HOT);
	await postLook(page, "Hot two", HOT, [work]);
	await openLooksPage(page, 3);
	// When
	await chips(page).getByRole("radio", { name: "Hot" }).click();
	await expect(cards(page)).toHaveCount(2);
	const hot = await cards(page).allTextContents();
	await chips(page).getByRole("radio", { name: "Work" }).click();
	await expect(cards(page)).toHaveText(["Hot two", "Cold work"]);
	const work2 = await cards(page).allTextContents();
	// Then
	expect({ hot, work: work2 }).toEqual({
		hot: ["Hot two", "Hot one"],
		work: ["Hot two", "Cold work"],
	});
});

test("shows No looks here for a chip with no look", async ({ page }) => {
	// Given: both projects, a fresh account, one look in "Polo + sweater"
	await postLook(page, "One", COLD);
	await openLooksPage(page, 1);
	// When
	await chips(page).getByRole("radio", { name: "Cool" }).click();
	// Then
	const title = page.getByRole("heading", { name: "No looks here" });
	await expect(title).toBeVisible();
	expect({
		title: await title.textContent(),
		line: await page.getByText("No saved look has").textContent(),
		cards: await cards(page).count(),
	}).toEqual({
		title: "No looks here",
		line: 'No saved look has "Cool".',
		cards: 0,
	});
});

test("shows the chip's newest look when the chip hides the open one", async ({
	page,
}) => {
	test.skip(isPhone(page), "the right part shows from 900 px");
	// Given: laptop, a fresh account; "Cold work" with "Work", then "Hot one",
	// and "Hot one" open
	const work = await postTag(page, "Work");
	await postLook(page, "Cold work", COLD, [work]);
	await postLook(page, "Hot one", HOT);
	await openLooksPage(page, 2);
	await card(page, "Hot one").click();
	await expect(page).toHaveURL(/\/looks\/[0-9a-f-]{36}$/);
	// When
	await chips(page).getByRole("radio", { name: "Work" }).click();
	// Then
	await expect(
		page
			.locator('[data-slot="look-panel"]')
			.getByRole("heading", { name: "Cold work" }),
	).toBeVisible();
});

test("shows the skeleton and no chips while the tags load", async ({
	page,
}) => {
	// Given: both projects, a fresh account with one look; GET /api/tags held
	// until the test lets it go
	await postLook(page, "One", COLD);
	let release = () => {};
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	await page.route("**/api/tags", async (route) => {
		await held;
		await route.continue();
	});
	// When
	await page.goto("/looks");
	// Then
	const skeletons = page.locator('[data-slot="look-skeleton"]');
	await expect(skeletons).toHaveCount(6);
	await expect(cards(page)).toHaveCount(0);
	expect({
		skeletons: await skeletons.count(),
		chips: await chips(page).count(),
	}).toEqual({ skeletons: 6, chips: 0 });
	release();
	await expect(chips(page)).toHaveCount(1);
	expect({
		skeletons: await skeletons.count(),
		chips: await chips(page).count(),
	}).toEqual({ skeletons: 0, chips: 1 });
});

test("keeps the compare picks with a chip on", async ({ page }) => {
	// Given: both projects, a fresh account; "Cold one" in "Polo + sweater",
	// "Hot one" in "Tee + casual shorts"
	await postLook(page, "Cold one", COLD);
	await postLook(page, "Hot one", HOT);
	await openLooksPage(page, 2);
	// When
	await page.getByRole("button", { name: "Compare", exact: true }).click();
	await page.getByRole("button", { name: "Cold one", exact: true }).click();
	await chips(page).getByRole("radio", { name: "Hot" }).click();
	await expect(cards(page)).toHaveCount(1);
	await page.getByRole("button", { name: "Hot one", exact: true }).click();
	// Then
	const compare = page.getByRole("button", { name: "Compare 2" });
	await expect(page.locator("h1")).toHaveText("2 picked");
	expect({
		h1: await page.locator("h1").textContent(),
		compare: await compare.textContent(),
		enabled: await compare.isEnabled(),
	}).toEqual({ h1: "2 picked", compare: "Compare 2", enabled: true });
});

const editTags = (page: Page) =>
	page.getByRole("dialog", { name: "Edit tags" });

async function openEditTags(page: Page) {
	await page.getByRole("button", { name: "Edit tags" }).click();
	await expect(editTags(page)).toBeVisible();
}

const rows = (page: Page) => editTags(page).getByRole("listitem");

test("opens Edit tags with each tag and a row for a new tag", async ({
	page,
}) => {
	// Given: both projects, a fresh account, tags "Work" and "Trip", one look
	await postTag(page, "Work");
	await postTag(page, "Trip");
	await postLook(page, "One", COLD);
	await openLooksPage(page, 1);
	// When
	await openEditTags(page);
	// Then
	const buttons = (name: RegExp) =>
		editTags(page).getByRole("button", { name }).count();
	expect({
		rows: await rows(page).allTextContents(),
		rename: await buttons(/^Rename /),
		delete: await buttons(/^Delete /),
		add: await buttons(/^\+ New tag$/),
	}).toEqual({ rows: ["Work", "Trip"], rename: 2, delete: 2, add: 1 });
});

test("keeps the old name and says Not saved when a rename fails", async ({
	page,
}) => {
	// Given: both projects, a fresh account, tag "Work", one look; each
	// rename answered 500
	await postTag(page, "Work");
	await postLook(page, "One", COLD);
	await page.route("**/api/tags/*", (route) =>
		route.request().method() === "PUT"
			? route.fulfill({ status: 500 })
			: route.continue(),
	);
	await openLooksPage(page, 1);
	// When
	await openEditTags(page);
	await editTags(page).getByRole("button", { name: "Rename Work" }).click();
	await editTags(page)
		.getByRole("textbox", { name: "New name for Work" })
		.fill("Office");
	await page.keyboard.press("Enter");
	// Then
	const alert = editTags(page).getByRole("alert");
	await expect(alert).toBeVisible();
	expect({
		rows: await rows(page).allTextContents(),
		alert: await alert.textContent(),
	}).toEqual({ rows: ["Work"], alert: "Not saved. Try again." });
});

const radios = (page: Page) => chips(page).getByRole("radio").allTextContents();

const lookTags = (page: Page) =>
	page.locator('[data-slot="look-view"] [data-slot="look-tag"]');

test("makes a tag, filters by it, renames it, and deletes it", async ({
	page,
}) => {
	// Given: both projects, a fresh account; "Navy" saved in "Polo + sweater"
	// with a new tag "Work" made in the save form, then "Plain" with no tag
	await openDress(page);
	await saveWithNewTags(page, "Navy", ["Work"]);
	await saveLook(page, "Plain");
	// When
	await openLooksPage(page, 2);
	await chips(page).getByRole("radio", { name: "Work" }).click();
	await openEditTags(page);
	await editTags(page).getByRole("button", { name: "Rename Work" }).click();
	await editTags(page)
		.getByRole("textbox", { name: "New name for Work" })
		.fill("Office");
	await page.keyboard.press("Enter");
	await expect(rows(page)).toHaveText(["Office"]);
	await page.keyboard.press("Escape");
	await expect(editTags(page)).toHaveCount(0);
	await expect(cards(page)).toHaveText(["Navy"]);
	const renamedRadios = await radios(page);
	const renamedCards = await cards(page).allTextContents();
	await card(page, "Navy").click();
	await expect(lookTags(page)).toHaveCount(1);
	const renamedLookTags = await lookTags(page).allTextContents();
	await openLooksPage(page, 2);
	await chips(page).getByRole("radio", { name: "Office" }).click();
	await openEditTags(page);
	await editTags(page).getByRole("button", { name: "Delete Office" }).click();
	await page
		.getByRole("alertdialog", { name: 'Delete the tag "Office"?' })
		.getByRole("button", { name: "Delete" })
		.click();
	const toast = page.locator('[data-slot="toast"]');
	await expect(toast).toHaveText("Tag deleted");
	const toastText = await toast.textContent();
	await editTags(page).getByRole("button", { name: "Close" }).click();
	await expect(editTags(page)).toHaveCount(0);
	await expect(cards(page)).toHaveCount(2);
	// Then
	expect({
		renamed: {
			radios: renamedRadios,
			cards: renamedCards,
			lookTags: renamedLookTags,
		},
		deleted: {
			toast: toastText,
			checked: await chips(page)
				.locator('[aria-checked="true"]')
				.allTextContents(),
			radios: await radios(page),
			cards: await cards(page).allTextContents(),
		},
	}).toEqual({
		renamed: {
			radios: ["All", "Hot", "Cool", "Cold", "Office"],
			cards: ["Navy"],
			lookTags: ["Office"],
		},
		deleted: {
			toast: "Tag deleted",
			checked: ["All"],
			radios: ["All", "Hot", "Cool", "Cold"],
			cards: ["Plain", "Navy"],
		},
	});
});

test("keeps the tag when Cancel is clicked in the confirm", async ({
	page,
}) => {
	// Given: both projects, a fresh account, tag "Work", one look
	await postTag(page, "Work");
	await postLook(page, "One", COLD);
	await openLooksPage(page, 1);
	// When
	await openEditTags(page);
	await editTags(page).getByRole("button", { name: "Delete Work" }).click();
	const confirm = page.getByRole("alertdialog", {
		name: 'Delete the tag "Work"?',
	});
	await confirm.getByRole("button", { name: "Cancel" }).click();
	await expect(confirm).toHaveCount(0);
	// Then
	expect({
		rows: await rows(page).allTextContents(),
		confirm: await confirm.count(),
	}).toEqual({ rows: ["Work"], confirm: 0 });
});
