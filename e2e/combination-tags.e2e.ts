import type { Page } from "@playwright/test";
import {
	colourIds,
	pick,
	postCombinations,
	three,
	two,
} from "./combination-helpers";
import { expect, test } from "./fixtures";

const saveDialog = (page: Page) =>
	page.getByRole("dialog", { name: "Save combination" });

const pills = (page: Page) => page.locator('[data-slot="combination-tag"]');

const toast = (page: Page) => page.locator('[data-slot="toast"]');

// Copied from e2e/tags.e2e.ts, which #77 deletes.
async function postTag(page: Page, name: string) {
	const res = await page.request.post("/api/tags", { data: { name } });
	expect(res.status()).toBe(201);
	return ((await res.json()) as { tag: { id: string } }).tag.id;
}

const storedCombinations = async (page: Page) =>
	(
		(await (await page.request.get("/api/combinations")).json()) as {
			combinations: { id: string; tags: string[] }[];
		}
	).combinations;

// THREE, saved with the tags work and weekend.
async function threeWithWorkAndWeekend(page: Page) {
	await page.goto("/");
	const work = await postTag(page, "work");
	const weekend = await postTag(page, "weekend");
	const saved = { ...three(await colourIds(page)), tags: [work, weekend] };
	await postCombinations(page, saved);
	return { id: saved.id, work, weekend };
}

async function typeNewTag(page: Page, name: string) {
	await saveDialog(page).getByRole("button", { name: "+ New tag" }).click();
	await saveDialog(page).getByRole("textbox", { name: "New tag" }).fill(name);
	await page.keyboard.press("Enter");
	await expect(
		saveDialog(page).getByRole("button", { name, exact: true }),
	).toHaveAttribute("aria-pressed", "true");
}

test("puts two new tags on a combination in the save form", async ({
	page,
}) => {
	// Given: both projects, a fresh account, /build, Navy casual pants and
	// Black long tee picked
	await page.goto("/build");
	await pick(page, "Bottom", "Casual pants", "Navy");
	await pick(page, "Inner top", "Long tee", "Black");
	// When
	await page.getByRole("button", { name: "Save" }).click();
	await typeNewTag(page, "work");
	await typeNewTag(page, "weekend");
	// Then
	await expect(saveDialog(page)).toHaveText(
		/Black long tee \+ Navy casual pants\s*Tags\s*work\s*weekend\s*\+ New tag/,
	);
	await expect(saveDialog(page).locator('[aria-pressed="true"]')).toHaveText([
		"work",
		"weekend",
	]);
	// When
	await saveDialog(page).getByRole("button", { name: "Save" }).click();
	// Then
	await expect(page).toHaveURL("/combinations");
	const tags = (
		(await (await page.request.get("/api/tags")).json()) as {
			tags: { id: string; name: string }[];
		}
	).tags;
	const ids = (name: string) => tags.find((t) => t.name === name)?.id;
	const stored = await storedCombinations(page);
	expect(stored.map((c) => c.tags)).toEqual([[ids("work"), ids("weekend")]]);
});

test("keeps a new tag when the tag list read before it lands after it", async ({
	page,
}) => {
	// Given: both projects, a fresh account, /build with two pieces picked;
	// the first GET of the tags is held until a tag is stored, then answers
	// the empty list it read before
	let stored: () => void = () => {};
	const tagStored = new Promise<void>((done) => {
		stored = done;
	});
	page.on("response", (res) => {
		if (res.request().method() === "POST" && res.url().endsWith("/api/tags"))
			stored();
	});
	let first = true;
	await page.route("**/api/tags", async (route) => {
		if (route.request().method() !== "GET" || !first) return route.continue();
		first = false;
		await tagStored;
		await route.fulfill({ json: { tags: [] } }).catch(() => {});
	});
	await page.goto("/build");
	await pick(page, "Bottom", "Casual pants", "Navy");
	await pick(page, "Inner top", "Long tee", "Black");
	// When
	await page.getByRole("button", { name: "Save" }).click();
	await saveDialog(page).getByRole("button", { name: "+ New tag" }).click();
	await saveDialog(page).getByRole("textbox", { name: "New tag" }).fill("work");
	await page.keyboard.press("Enter");
	// Then
	await expect(
		saveDialog(page).getByRole("button", { name: "work", exact: true }),
	).toHaveAttribute("aria-pressed", "true");
	// When
	await saveDialog(page).getByRole("button", { name: "Save" }).click();
	// Then
	await expect(page).toHaveURL("/combinations");
	expect((await storedCombinations(page)).map((c) => c.tags.length)).toEqual([
		1,
	]);
});

test("shows the tags as pills on the combination page", async ({ page }) => {
	// Given: both projects, a fresh account, THREE with work and weekend
	const { id } = await threeWithWorkAndWeekend(page);
	// When
	await page.goto(`/combinations/${id}`);
	// Then
	await expect(pills(page)).toHaveText(["work", "weekend"]);
});

test("shows no pill row for a combination with no tags", async ({ page }) => {
	// Given: both projects, a fresh account, THREE with no tags
	await page.goto("/");
	const saved = three(await colourIds(page));
	await postCombinations(page, saved);
	// When
	await page.goto(`/combinations/${saved.id}`);
	// Then
	await expect(page.locator('[data-slot="piece-line"]')).toHaveCount(3);
	await expect(page.locator('[data-slot="combination-tags"]')).toHaveCount(0);
});

test("keeps a combination's tags on Save changes when the tags do not load", async ({
	page,
}) => {
	// Given: both projects, a fresh account, THREE with work and weekend;
	// every GET of the tags answers 500
	const { id, work, weekend } = await threeWithWorkAndWeekend(page);
	await page.route("**/api/tags", (route) =>
		route.request().method() === "GET"
			? route.fulfill({ status: 500 })
			: route.continue(),
	);
	// When
	await page.goto(`/build/${id}`);
	await page.getByRole("button", { name: "Save" }).click();
	await saveDialog(page).getByRole("button", { name: "Save changes" }).click();
	// Then
	await expect(toast(page)).toHaveText("Changes saved");
	const stored = await storedCombinations(page);
	expect(stored.find((c) => c.id === id)?.tags).toEqual([work, weekend]);
});

test("takes a tag off with Save changes", async ({ page }) => {
	// Given: both projects, a fresh account, THREE with work and weekend
	const { id } = await threeWithWorkAndWeekend(page);
	// When
	await page.goto(`/build/${id}`);
	await page.getByRole("button", { name: "Save" }).click();
	await saveDialog(page)
		.getByRole("button", { name: "weekend", exact: true })
		.click();
	await saveDialog(page).getByRole("button", { name: "Save changes" }).click();
	// Then
	await expect(toast(page)).toHaveText("Changes saved");
	await expect(pills(page)).toHaveText(["work"]);
});

const tagRows = (page: Page) =>
	page.locator('[data-slot="tag-list"]').getByRole("button");

const tagRowNames = (page: Page) =>
	tagRows(page).evaluateAll((buttons) =>
		buttons.map((b) => b.getAttribute("aria-label")),
	);

const notes = (page: Page) => page.locator('[data-slot="label-note"]');

const sheet = (page: Page, name = "New tag") =>
	page.getByRole("dialog", { name });

const nameBox = (page: Page) =>
	page.getByRole("dialog").getByRole("textbox", { name: "Name" });

const mainNav = (page: Page) => page.getByRole("navigation", { name: "Main" });

async function openTags(page: Page) {
	await page.goto("/labels");
	await page.getByRole("tab", { name: "Tags" }).click();
}

async function renameFromRow(page: Page, from: string, to: string) {
	await tagRows(page).filter({ hasText: from }).click();
	await nameBox(page).fill(to);
	await sheet(page, "Edit tag")
		.getByRole("button", { name: "Save", exact: true })
		.click();
	await expect(sheet(page, "Edit tag")).toHaveCount(0);
}

async function deleteFromRow(page: Page, name: string) {
	await tagRows(page).filter({ hasText: name }).click();
	await page
		.getByRole("dialog")
		.getByRole("button", { name: "Delete" })
		.click();
	await page
		.getByRole("dialog")
		.getByRole("button", { name: "Delete" })
		.click();
	await expect(page.getByRole("dialog")).toHaveCount(0);
}

// From the Labels page to the combination's page.
async function openTheCard(page: Page) {
	await mainNav(page).getByRole("link", { name: "Combinations" }).click();
	await page.locator('[data-slot="combination-card"]').click();
}

async function openItsSaveForm(page: Page) {
	await page.getByRole("link", { name: "Change this combination" }).click();
	await page.getByRole("button", { name: "Save" }).click();
}

test("lists each tag with how many combinations carry it", async ({ page }) => {
	// Given: both projects, a fresh account; tags work, weekend, rain; THREE
	// with work and weekend, TWO with work
	const work = await postTag(page, "work");
	const weekend = await postTag(page, "weekend");
	await postTag(page, "rain");
	const ids = await colourIds(page);
	await postCombinations(
		page,
		{ ...three(ids), tags: [work, weekend] },
		{ ...two(ids), tags: [work] },
	);
	// When
	await openTags(page);
	// Then
	await expect(tagRows(page)).toHaveCount(3);
	expect(await tagRowNames(page)).toEqual(["work", "weekend", "rain"]);
	await expect(notes(page)).toHaveText([
		"2 combinations",
		"1 combination",
		"Not in use",
	]);
});

test("shows No tags yet for a new account", async ({ page }) => {
	// Given: both projects, a fresh account
	// When
	await openTags(page);
	// Then
	await expect(
		page.getByRole("heading", { name: "No tags yet" }),
	).toBeVisible();
	await expect(page.getByText("Tap + to add your first tag.")).toBeVisible();
	await expect(page.getByRole("button", { name: "Add a tag" })).toBeVisible();
});

test("adds a tag from the + form", async ({ page }) => {
	// Given: both projects, a fresh account, the Tags part open
	await openTags(page);
	// When
	await page.getByRole("button", { name: "Add a tag" }).click();
	await nameBox(page).fill("work");
	await sheet(page).getByRole("button", { name: "Save", exact: true }).click();
	// Then
	await expect(toast(page)).toHaveText("Tag saved");
	await expect(tagRows(page)).toHaveCount(1);
	expect(await tagRowNames(page)).toEqual(["work"]);
	await expect(notes(page)).toHaveText(["Not in use"]);
});

test("asks for a tag name and sends nothing", async ({ page }) => {
	// Given: both projects, a fresh account, the Tags part open; the tag
	// POSTs counted
	let posts = 0;
	page.on("request", (r) => {
		if (r.method() === "POST" && r.url().endsWith("/api/tags")) posts++;
	});
	await openTags(page);
	// When
	await page.getByRole("button", { name: "Add a tag" }).click();
	await sheet(page).getByRole("button", { name: "Save", exact: true }).click();
	// Then
	await expect(sheet(page).getByRole("alert")).toHaveText("Enter a name.");
	expect(posts).toBe(0);
});

test("says a taken tag name is taken, in any case", async ({ page }) => {
	// Given: both projects, a fresh account; tag work; the Tags part open
	await postTag(page, "work");
	await openTags(page);
	await expect(tagRows(page)).toHaveCount(1);
	// When
	await page.getByRole("button", { name: "Add a tag" }).click();
	await nameBox(page).fill("WORK");
	await sheet(page).getByRole("button", { name: "Save", exact: true }).click();
	// Then
	await expect(sheet(page).getByRole("alert")).toHaveText(
		"You have this tag already.",
	);
	await expect(sheet(page)).toBeVisible();
});

test("keeps a tag name to 24 characters", async ({ page }) => {
	// Given: both projects, a fresh account, the New tag sheet open
	await openTags(page);
	await page.getByRole("button", { name: "Add a tag" }).click();
	// When
	await nameBox(page).pressSequentially("rainy days and grey skies");
	// Then
	await expect(nameBox(page)).toHaveValue("rainy days and grey skie");
});

test("renames a tag from its row", async ({ page }) => {
	// Given: both projects, a fresh account; tag work; the Tags part open
	await postTag(page, "work");
	await openTags(page);
	// When
	await tagRows(page).filter({ hasText: "work" }).click();
	// Then
	await expect(nameBox(page)).toHaveValue("work");
	await expect(
		sheet(page, "Edit tag").getByRole("button", { name: "Delete" }),
	).toBeVisible();
	// When
	await nameBox(page).fill("office");
	await sheet(page, "Edit tag")
		.getByRole("button", { name: "Save", exact: true })
		.click();
	// Then
	await expect(toast(page)).toHaveText("Tag saved");
	await expect(tagRows(page)).toHaveCount(1);
	expect(await tagRowNames(page)).toEqual(["office"]);
	await expect(notes(page)).toHaveText(["Not in use"]);
});

test("deletes a tag from the confirm step", async ({ page }) => {
	// Given: both projects, a fresh account; THREE with work and weekend; the
	// Tags part open
	const { weekend } = await threeWithWorkAndWeekend(page);
	await openTags(page);
	// When
	await tagRows(page).filter({ hasText: "work" }).click();
	await sheet(page, "Edit tag").getByRole("button", { name: "Delete" }).click();
	// Then
	const confirm = page.getByRole("dialog", { name: "Delete this tag?" });
	await expect(confirm.getByRole("button", { name: "Back" })).toBeVisible();
	await expect(confirm).toContainText("It comes off 1 combination.");
	// When
	await confirm.getByRole("button", { name: "Delete" }).click();
	// Then
	await expect(toast(page)).toHaveText("Tag deleted");
	await expect(tagRows(page)).toHaveCount(1);
	expect(await tagRowNames(page)).toEqual(["weekend"]);
	await expect(notes(page)).toHaveText(["1 combination"]);
	expect((await storedCombinations(page)).map((c) => c.tags)).toEqual([
		[weekend],
	]);
});

test("shows a renamed tag on the combination page and in the save form", async ({
	page,
}) => {
	// Given: both projects, a fresh account; THREE with the tag work; the
	// Tags part open
	const work = await postTag(page, "work");
	await postCombinations(page, {
		...three(await colourIds(page)),
		tags: [work],
	});
	await openTags(page);
	// When
	await renameFromRow(page, "work", "office");
	await openTheCard(page);
	// Then
	await expect(pills(page)).toHaveText(["office"]);
	// When
	await openItsSaveForm(page);
	// Then
	await expect(saveDialog(page).locator("[aria-pressed]")).toHaveText([
		"office",
	]);
	await expect(saveDialog(page).locator('[aria-pressed="true"]')).toHaveText([
		"office",
	]);
});

test("drops a deleted tag from the combination page and the save form", async ({
	page,
}) => {
	// Given: both projects, a fresh account; THREE with work and weekend; the
	// Tags part open
	await threeWithWorkAndWeekend(page);
	await openTags(page);
	// When
	await deleteFromRow(page, "weekend");
	await openTheCard(page);
	// Then
	await expect(pills(page)).toHaveText(["work"]);
	// When
	await openItsSaveForm(page);
	// Then
	await expect(saveDialog(page).locator("[aria-pressed]")).toHaveText(["work"]);
});

test("shows Could not load your tags and loads on Retry", async ({ page }) => {
	// Given: both projects, a fresh account; the first GET of the tags
	// answers 500
	let calls = 0;
	await page.route("**/api/tags", (route) =>
		calls++ === 0 ? route.fulfill({ status: 500 }) : route.continue(),
	);
	// When
	await openTags(page);
	// Then
	await expect(
		page.getByRole("heading", { name: "Could not load your tags" }),
	).toBeVisible();
	// When
	await page.getByRole("button", { name: "Retry" }).click();
	// Then
	await expect(
		page.getByRole("heading", { name: "No tags yet" }),
	).toBeVisible();
});

test("keeps the sheet open with Not saved when Save fails", async ({
	page,
}) => {
	// Given: both projects, a fresh account; tag work; each rename answers 500
	await postTag(page, "work");
	await page.route("**/api/tags/*", (route) =>
		route.request().method() === "PUT"
			? route.fulfill({ status: 500 })
			: route.fallback(),
	);
	await openTags(page);
	// When
	await tagRows(page).filter({ hasText: "work" }).click();
	await nameBox(page).fill("office");
	await sheet(page, "Edit tag")
		.getByRole("button", { name: "Save", exact: true })
		.click();
	// Then
	await expect(sheet(page, "Edit tag").getByRole("alert")).toHaveText(
		"Not saved. Try again.",
	);
	await expect(sheet(page, "Edit tag")).toBeVisible();
	// The open dialog hides the rows from role queries, so read the slot.
	await expect(page.locator('[data-slot="tag-list"] button')).toHaveAttribute(
		"aria-label",
		"work",
	);
});
