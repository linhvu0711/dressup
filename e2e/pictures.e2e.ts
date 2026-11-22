import type { Page, Request } from "@playwright/test";
import { postOwnedItems } from "./closet-helpers";
import { expect, test } from "./fixtures";
import { colourIds } from "./label-helpers";
import { fact, sheet, toast } from "./locators";
import {
	bigJpeg,
	imageSize,
	itemPictureIds,
	pickFiles,
	pngFile,
	uploadPng,
	uprightTestJpeg,
} from "./picture-helpers";

const addSheet = (page: Page) => sheet(page, "Add to closet");

const editSheet = (page: Page) => sheet(page, "Edit item");

const addButton = (page: Page) =>
	page.getByRole("button", { name: "Add pictures" });

const slot = (page: Page, n: number) =>
	page.getByRole("listitem", { name: `Picture ${n}`, exact: true });

const slots = (page: Page) =>
	page
		.getByRole("list", { name: "Pictures", exact: true })
		.getByRole("listitem", { name: /^Picture \d+$/ });

// The header's "+", which comes before the empty notice's button.
const openAddSheet = (page: Page) =>
	page
		.getByRole("button", { name: "Add to closet", exact: true })
		.first()
		.click();

// Picks Long button-up and Navy in the open add sheet.
async function pickNavyShirt(page: Page) {
	await addSheet(page).getByRole("button", { name: "Pick a type" }).click();
	await sheet(page, "Pick a type")
		.getByRole("button", { name: "Long button-up", exact: true })
		.click();
	await addSheet(page)
		.getByRole("radiogroup", { name: "Colour" })
		.getByRole("radio", { name: "Navy", exact: true })
		.click();
}

// A Navy long button-up with no brand and these pictures, its Item page
// open, and its edit sheet open.
async function openEditSheet(page: Page, pictureIds: string[] = []) {
	await page.goto("/");
	const ids = await colourIds(page);
	const [id] = await postOwnedItems(page, {
		typeId: "shirt_l",
		colourId: ids.Navy,
		brandId: null,
		quantity: 1,
		pictureIds,
	});
	await page.goto(`/closet/${id}`);
	await page.getByRole("button", { name: "Edit item" }).click();
	await expect(editSheet(page)).toBeVisible();
	return ids;
}

// Holds every upload until the test lets it go.
async function holdUploads(page: Page) {
	let release = () => {};
	const released = new Promise<void>((resolve) => {
		release = resolve;
	});
	await page.route("**/api/pictures", async (route) => {
		await released;
		await route.continue();
	});
	return release;
}

// Answers every upload with this status and error code.
const refuseUploads = (page: Page, status: number, error: string) =>
	page.route("**/api/pictures", (route) =>
		route.fulfill({ status, json: { error } }),
	);

test("shows the picture slots in the add sheet", async ({ page }) => {
	// Given: a fresh account on the Closet page
	await page.goto("/closet");
	// When
	await openAddSheet(page);
	// Then
	await expect(addSheet(page).getByText("Pictures (up to 8)")).toBeVisible();
	await expect(slots(page)).toHaveCount(0);
	await expect(addButton(page)).toBeVisible();
});

test("adds two pictures at once in the add sheet", async ({ page }) => {
	// Given: the add sheet open with Long button-up and Navy picked
	await page.goto("/closet");
	await openAddSheet(page);
	await pickNavyShirt(page);
	// When
	await pickFiles(page, addButton(page), [
		pngFile("front.png"),
		pngFile("back.png"),
	]);
	await expect(slots(page)).toHaveCount(2);
	await addSheet(page).getByRole("button", { name: "Save" }).click();
	// Then
	await expect(toast(page)).toHaveText("Added to your closet");
	expect(await itemPictureIds(page)).toHaveLength(2);
});

test("shows a busy slot while a picture uploads", async ({ page }) => {
	// Given: an item; uploads held; its edit sheet open
	await openEditSheet(page);
	await holdUploads(page);
	// When
	await pickFiles(page, addButton(page), [pngFile("front.png")]);
	// Then
	await expect(slot(page, 1)).toHaveAttribute("aria-busy", "true");
});

test("keeps the sheet usable and saves after a slow upload", async ({
	page,
}) => {
	// Given: an item; uploads held; its edit sheet open; one picture picked
	await openEditSheet(page);
	const release = await holdUploads(page);
	await pickFiles(page, addButton(page), [pngFile("front.png")]);
	await expect(slot(page, 1)).toHaveAttribute("aria-busy", "true");
	// When
	await editSheet(page).getByRole("button", { name: "More" }).click();
	await editSheet(page).getByRole("button", { name: "Save" }).click();
	release();
	// Then
	await expect(toast(page)).toHaveText("Changes saved");
	await expect(fact(page, "Quantity")).toHaveText("2");
	expect(await itemPictureIds(page)).toHaveLength(1);
});

test("uploads nothing when Cancel comes while a picture shrinks", async ({
	page,
}) => {
	// Given: shrinking waits for a go; the edit sheet open; one picture picked
	await page.addInitScript(() => {
		const w = window as unknown as {
			openShrink: () => void;
			shrunk: boolean;
		};
		const gate = new Promise<void>((go) => {
			w.openShrink = go;
		});
		const read = window.createImageBitmap.bind(window);
		window.createImageBitmap = (async (
			...args: Parameters<typeof createImageBitmap>
		) => {
			await gate;
			return read(...args);
		}) as typeof createImageBitmap;
		const toBlob = HTMLCanvasElement.prototype.toBlob;
		HTMLCanvasElement.prototype.toBlob = function (done, ...rest) {
			toBlob.call(
				this,
				(blob) => {
					done(blob);
					w.shrunk = true;
				},
				...rest,
			);
		};
	});
	await openEditSheet(page);
	const uploads: string[] = [];
	page.on("request", (r) => {
		if (r.method() === "POST" && r.url().endsWith("/api/pictures"))
			uploads.push(r.url());
	});
	await pickFiles(page, addButton(page), [pngFile("front.png")]);
	// When
	await editSheet(page).getByRole("button", { name: "Cancel" }).click();
	await page.evaluate(() =>
		(window as unknown as { openShrink: () => void }).openShrink(),
	);
	await page.waitForFunction(
		() => (window as unknown as { shrunk?: boolean }).shrunk === true,
	);
	// The upload would start a few awaits after the shrink ends.
	await page.waitForTimeout(500);
	// Then
	expect(uploads).toEqual([]);
});

test("saves nothing when Cancel comes while Save waits for an upload", async ({
	page,
}) => {
	// Given: an item; uploads held; its edit sheet open; one picture picked
	await openEditSheet(page);
	const release = await holdUploads(page);
	await pickFiles(page, addButton(page), [pngFile("front.png")]);
	await expect(slot(page, 1)).toHaveAttribute("aria-busy", "true");
	const changes: string[] = [];
	page.on("request", (r) => {
		if (r.method() === "PUT" && r.url().includes("/api/owned-items/"))
			changes.push(r.url());
	});
	// When
	await editSheet(page).getByRole("button", { name: "More" }).click();
	await editSheet(page).getByRole("button", { name: "Save" }).click();
	await editSheet(page).getByRole("button", { name: "Cancel" }).click();
	const dropped = page.waitForResponse(
		(r) =>
			r.request().method() === "DELETE" && r.url().includes("/api/pictures/"),
	);
	release();
	await dropped;
	// Then
	await page.reload();
	await expect(fact(page, "Quantity")).toHaveText("1");
	expect(changes).toEqual([]);
	expect(await itemPictureIds(page)).toHaveLength(0);
});

test("shows Failed and Try again when an upload fails", async ({ page }) => {
	// Given: an item with one picture; the next upload aborts once
	const first = await (async () => {
		await page.goto("/");
		return uploadPng(page);
	})();
	await openEditSheet(page, [first]);
	let failed = false;
	await page.route("**/api/pictures", (route) => {
		if (failed) return route.continue();
		failed = true;
		return route.abort();
	});
	// When
	await pickFiles(page, addButton(page), [pngFile("back.png")]);
	await expect(slot(page, 2).getByText("Failed")).toBeVisible();
	await expect(slot(page, 1).locator("img")).toBeVisible();
	await slot(page, 2).getByRole("button", { name: "Try again" }).click();
	// Then
	await expect(slots(page)).toHaveCount(2);
	await expect(editSheet(page).getByText("Failed")).toHaveCount(0);
	await expect(slot(page, 2)).not.toHaveAttribute("aria-busy", "true");
});

test("removes a picture with the cross and Save", async ({ page }) => {
	// Given: an item with pictures a and b; its edit sheet open
	await page.goto("/");
	const a = await uploadPng(page);
	const b = await uploadPng(page);
	await openEditSheet(page, [a, b]);
	// When
	await slot(page, 1).getByRole("button", { name: "Remove picture" }).click();
	await editSheet(page).getByRole("button", { name: "Save" }).click();
	// Then
	await expect(toast(page)).toHaveText("Changes saved");
	expect(await itemPictureIds(page)).toEqual([b]);
	expect((await page.request.get(`/api/pictures/${a}`)).status()).toBe(404);
});

test("keeps the pictures on Cancel", async ({ page }) => {
	// Given: an item with pictures a and b; its edit sheet open
	await page.goto("/");
	const a = await uploadPng(page);
	const b = await uploadPng(page);
	await openEditSheet(page, [a, b]);
	// When
	await slot(page, 1).getByRole("button", { name: "Remove picture" }).click();
	await editSheet(page).getByRole("button", { name: "Cancel" }).click();
	// Then
	await expect(editSheet(page)).toHaveCount(0);
	expect(await itemPictureIds(page)).toEqual([a, b]);
});

test("drops a new picture on Cancel", async ({ page }) => {
	// Given: an item with no pictures; its edit sheet open
	await openEditSheet(page);
	const uploaded = page.waitForResponse(
		(res) =>
			res.url().endsWith("/api/pictures") && res.request().method() === "POST",
	);
	// When
	await pickFiles(page, addButton(page), [pngFile("front.png")]);
	const { picture } = (await (await uploaded).json()) as {
		picture: { id: string };
	};
	await expect(slot(page, 1)).not.toHaveAttribute("aria-busy", "true");
	const dropped = page.waitForResponse(
		(res) =>
			res.url().endsWith(`/api/pictures/${picture.id}`) &&
			res.request().method() === "DELETE",
	);
	await editSheet(page).getByRole("button", { name: "Cancel" }).click();
	await dropped;
	// Then
	expect(await itemPictureIds(page)).toEqual([]);
	expect((await page.request.get(`/api/pictures/${picture.id}`)).status()).toBe(
		404,
	);
});

test("refuses a file that is not a picture before any upload", async ({
	page,
}) => {
	// Given: an item's edit sheet open; the page's requests recorded
	await openEditSheet(page);
	const sent: Request[] = [];
	page.on("request", (request) => {
		if (request.url().includes("/api/pictures")) sent.push(request);
	});
	// When
	await pickFiles(page, addButton(page), [
		{ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") },
	]);
	// Then
	await expect(editSheet(page).getByRole("alert")).toHaveText("Only pictures.");
	expect(sent).toEqual([]);
});

test("says a picture is too big when it cannot shrink under 1 MB", async ({
	page,
}) => {
	// Given: every JPEG the page's canvas makes is one byte over 1 MB, since
	// no real picture stays that big in Chrome (plan P1); an item's edit sheet
	// open
	await page.addInitScript(() => {
		HTMLCanvasElement.prototype.toBlob = (done) => {
			done(new Blob([new Uint8Array(1_048_577)], { type: "image/jpeg" }));
		};
	});
	await openEditSheet(page);
	// When
	await pickFiles(page, addButton(page), [pngFile("front.png")]);
	// Then
	await expect(editSheet(page).getByRole("alert")).toHaveText(
		"This picture is too big, even after shrinking. Try a smaller one.",
	);
});

test("says a file the browser cannot read cannot be read", async ({ page }) => {
	// Given: an item's edit sheet open
	await openEditSheet(page);
	// When
	await pickFiles(page, addButton(page), [
		{
			name: "broken.png",
			mimeType: "image/png",
			buffer: Buffer.from("not a picture"),
		},
	]);
	// Then
	await expect(editSheet(page).getByRole("alert")).toHaveText(
		"This picture cannot be read. Try a JPEG or PNG.",
	);
});

test("stops at 8 pictures on one item", async ({ page }) => {
	// Given: an item's edit sheet open
	await openEditSheet(page);
	// When
	await pickFiles(
		page,
		addButton(page),
		Array.from({ length: 9 }, (_, i) => pngFile(`p${i + 1}.png`)),
	);
	// Then
	await expect(slots(page)).toHaveCount(8);
	await expect(addButton(page)).toHaveCount(0);
	await expect(
		editSheet(page).getByText("8 pictures is the limit for one item."),
	).toBeVisible();
	await editSheet(page).getByRole("button", { name: "Save" }).click();
	await expect(toast(page)).toHaveText("Changes saved");
	await page.getByRole("button", { name: "Edit item" }).click();
	await expect(slots(page)).toHaveCount(8);
});

test("says the account limit when the server answers account_picture_limit", async ({
	page,
}) => {
	// Given: an item's edit sheet open; uploads answer 409
	await openEditSheet(page);
	await refuseUploads(page, 409, "account_picture_limit");
	// When
	await pickFiles(page, addButton(page), [pngFile("front.png")]);
	// Then
	await expect(
		editSheet(page).getByText(
			"You have 1,000 pictures. That is the limit. Delete some to add new ones.",
		),
	).toBeVisible();
	await expect(slots(page)).toHaveCount(0);
});

test("says storage is full when the server answers storage_full", async ({
	page,
}) => {
	// Given: an item's edit sheet open; uploads answer 507
	await openEditSheet(page);
	await refuseUploads(page, 507, "storage_full");
	// When
	await pickFiles(page, addButton(page), [pngFile("front.png")]);
	// Then
	await expect(
		editSheet(page).getByText(
			"Picture storage is full. No new pictures for now.",
		),
	).toBeVisible();
	await expect(slots(page)).toHaveCount(0);
});

test("shows the sign-in screen when an upload answers 401", async ({
	page,
}) => {
	// Given: an item's edit sheet open; then the session is gone for the
	// upload and for the session check
	await openEditSheet(page);
	const noSession = { status: 401, json: { error: "unauthorized" } };
	await page.route("**/api/pictures", (route) => route.fulfill(noSession));
	await page.route("/api/me", (route) => route.fulfill(noSession));
	// When
	await pickFiles(page, addButton(page), [pngFile("front.png")]);
	// Then
	await expect(
		page.getByRole("button", { name: "Sign in with Google" }),
	).toBeVisible();
});

test("shrinks a big picture to a JPEG of 1600 px", async ({ page }) => {
	// Given: an item's edit sheet open; a 3200 by 2400 JPEG
	await openEditSheet(page);
	const big = await bigJpeg(page);
	// When
	await pickFiles(page, addButton(page), [big]);
	await expect(slots(page)).toHaveCount(1);
	await editSheet(page).getByRole("button", { name: "Save" }).click();
	await expect(toast(page)).toHaveText("Changes saved");
	const [id] = await itemPictureIds(page);
	const stored = await page.request.get(`/api/pictures/${id}`);
	// Then
	expect({
		type: stored.headers()["content-type"],
		small: (await stored.body()).length <= 1_048_576,
		size: await imageSize(page, `/api/pictures/${id}`),
	}).toEqual({
		type: "image/jpeg",
		small: true,
		size: { width: 1600, height: 1200 },
	});
});

test("turns a picture upright from its EXIF orientation", async ({ page }) => {
	// Given: an item's edit sheet open; a 200 by 100 JPEG with orientation 6
	await openEditSheet(page);
	const turned = await uprightTestJpeg(page);
	// When
	await pickFiles(page, addButton(page), [turned]);
	await expect(slots(page)).toHaveCount(1);
	await editSheet(page).getByRole("button", { name: "Save" }).click();
	await expect(toast(page)).toHaveText("Changes saved");
	const [id] = await itemPictureIds(page);
	// Then
	expect(await imageSize(page, `/api/pictures/${id}`)).toEqual({
		width: 100,
		height: 200,
	});
});

// A Navy long button-up with no brand and n pictures, its Item page open.
async function openItemPage(page: Page, n: number) {
	await page.goto("/");
	const pictureIds: string[] = [];
	for (let i = 0; i < n; i++) pictureIds.push(await uploadPng(page));
	const ids = await colourIds(page);
	const [id] = await postOwnedItems(page, {
		typeId: "shirt_l",
		colourId: ids.Navy,
		brandId: null,
		quantity: 1,
		pictureIds,
	});
	await page.goto(`/closet/${id}`);
}

const viewer = (page: Page) => page.getByRole("dialog", { name: /^Picture / });

test("opens the viewer and steps to the next picture", async ({ page }) => {
	// Given: an item with 2 pictures
	await openItemPage(page, 2);
	// When
	await page.getByRole("button", { name: "Open picture 1 of 2" }).click();
	await page.getByRole("button", { name: "Next picture" }).click();
	// Then
	await expect(
		page.getByRole("dialog", { name: "Picture 2 of 2" }),
	).toContainText("2 / 2");
	await expect(
		page.getByRole("button", { name: "Next picture" }),
	).toBeDisabled();
	await expect(viewer(page).getByRole("button", { name: "Close" })).toHaveCount(
		0,
	);
});

test("closes the viewer with Esc and with a click outside", async ({
	page,
}) => {
	// Given: an item with 2 pictures; the viewer open on picture 1
	await openItemPage(page, 2);
	await page.getByRole("button", { name: "Open picture 1 of 2" }).click();
	await expect(viewer(page)).toBeVisible();
	// When
	await page.keyboard.press("Escape");
	const afterEsc = await viewer(page).count();
	await page.getByRole("button", { name: "Open picture 1 of 2" }).click();
	// Radix turns clicks on for a dialog opened again a moment after it
	// shows; a person never clicks that fast, so wait for it as they would.
	await expect(viewer(page)).toHaveCSS("pointer-events", "auto");
	await page.mouse.click(8, 8);
	// Then
	await expect(viewer(page)).toHaveCount(0);
	expect(afterEsc).toBe(0);
});

test("shows one picture with no previous and next", async ({ page }) => {
	// Given: an item with 1 picture
	await openItemPage(page, 1);
	// When
	await page.getByRole("button", { name: "Open picture 1 of 1" }).click();
	// Then
	await expect(
		page.getByRole("dialog", { name: "Picture 1 of 1" }),
	).toBeVisible();
	await expect(page.getByRole("button", { name: "Next picture" })).toHaveCount(
		0,
	);
	await expect(
		page.getByRole("button", { name: "Previous picture" }),
	).toHaveCount(0);
});
