import { readFileSync } from "node:fs";
import type { Locator, Page } from "@playwright/test";
import { expect } from "./fixtures";

type PickedFile = { name: string; mimeType: string; buffer: Buffer };

const ICON = readFileSync("public/icon-512.png");

// A real 512 px PNG of the repo, under any name.
export const pngFile = (name: string): PickedFile => ({
	name,
	mimeType: "image/png",
	buffer: ICON,
});

// Uploads the PNG as the page's account and gives back the draft's id.
export async function uploadPng(page: Page): Promise<string> {
	const res = await page.request.post("/api/pictures", {
		data: ICON,
		headers: { "content-type": "image/png" },
	});
	expect(res.status()).toBe(201);
	return ((await res.json()) as { picture: { id: string } }).picture.id;
}

// A 3200 by 2400 JPEG of random pixels, made by the page's canvas, so its
// shrink must both scale it and lower its quality.
export async function bigJpeg(page: Page): Promise<PickedFile> {
	const base64 = await page.evaluate(async () => {
		const canvas = new OffscreenCanvas(3200, 2400);
		const context = canvas.getContext("2d");
		if (!context) throw new Error("no 2d context");
		const image = context.createImageData(3200, 2400);
		for (let i = 0; i < image.data.length; i++)
			image.data[i] = i % 4 === 3 ? 255 : Math.floor(Math.random() * 256);
		context.putImageData(image, 0, 0);
		const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 1 });
		const bytes = new Uint8Array(await blob.arrayBuffer());
		let text = "";
		for (const byte of bytes) text += String.fromCharCode(byte);
		return btoa(text);
	});
	return {
		name: "big.jpg",
		mimeType: "image/jpeg",
		buffer: Buffer.from(base64, "base64"),
	};
}

// EXIF orientation 6 (turn a quarter right), as a camera writes it (P1).
const ORIENTATION_6 = [
	0xff, 0xe1, 0x00, 0x22, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0x4d, 0x4d, 0x00,
	0x2a, 0x00, 0x00, 0x00, 0x08, 0x00, 0x01, 0x01, 0x12, 0x00, 0x03, 0x00, 0x00,
	0x00, 0x01, 0x00, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
];

// A 200 by 100 JPEG that the EXIF tag turns into 100 by 200.
export async function uprightTestJpeg(page: Page): Promise<PickedFile> {
	const bytes = await page.evaluate(async () => {
		const canvas = new OffscreenCanvas(200, 100);
		const context = canvas.getContext("2d");
		if (!context) throw new Error("no 2d context");
		context.fillStyle = "#1F3A5F";
		context.fillRect(0, 0, 200, 100);
		const blob = await canvas.convertToBlob({ type: "image/jpeg" });
		return [...new Uint8Array(await blob.arrayBuffer())];
	});
	return {
		name: "turned.jpg",
		mimeType: "image/jpeg",
		buffer: Buffer.from([
			...bytes.slice(0, 2),
			...ORIENTATION_6,
			...bytes.slice(2),
		]),
	};
}

// Clicks the button and picks the files in the system picker it opens.
export async function pickFiles(
	page: Page,
	button: Locator,
	files: PickedFile[],
) {
	const chooser = page.waitForEvent("filechooser");
	await button.click();
	await (await chooser).setFiles(files);
}

// The width and height the browser reads from a picture the page can load.
export const imageSize = (page: Page, url: string) =>
	page.evaluate(async (path) => {
		const bitmap = await createImageBitmap(await (await fetch(path)).blob());
		return { width: bitmap.width, height: bitmap.height };
	}, url);

// The picture ids of the account's only item, as the server lists them.
export async function itemPictureIds(page: Page): Promise<string[]> {
	const res = await page.request.get("/api/owned-items");
	const { ownedItems } = (await res.json()) as {
		ownedItems: { pictureIds: string[] }[];
	};
	return ownedItems[0]?.pictureIds ?? [];
}
