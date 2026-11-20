import { PICTURE_BYTES_MAX } from "./picture";

const PICTURE_LONG_SIDE = 1600;

// The quality steps for JPEG, from good to small.
const QUALITIES = [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3];

// No quality step made the file small enough.
export class TooBig extends Error {}

// The browser cannot decode the file, as HEIC in Chrome.
class Unreadable extends Error {}

// The size with the long side at most max, never larger than the picture.
export function fitLongSide(width: number, height: number, max: number) {
	const scale = Math.min(1, max / Math.max(width, height));
	return {
		width: Math.round(width * scale),
		height: Math.round(height * scale),
	};
}

export async function encodeUnder(
	encode: (quality: number) => Promise<Blob>,
	maxBytes: number,
): Promise<Blob> {
	for (const quality of QUALITIES) {
		const blob = await encode(quality);
		if (blob.size <= maxBytes) return blob;
	}
	throw new TooBig();
}

// Upright from the EXIF orientation, the long side at most 1600 px, and a
// JPEG of 1 MB or less: Safari cannot encode WebP from a canvas.
export async function shrinkPicture(file: Blob): Promise<Blob> {
	const bitmap = await createImageBitmap(file, {
		imageOrientation: "from-image",
	}).catch(() => {
		throw new Unreadable();
	});
	const { width, height } = fitLongSide(
		bitmap.width,
		bitmap.height,
		PICTURE_LONG_SIDE,
	);
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	canvas.getContext("2d")?.drawImage(bitmap, 0, 0, width, height);
	bitmap.close();
	return encodeUnder(
		(quality) =>
			new Promise((resolve, reject) =>
				canvas.toBlob(
					(blob) => (blob ? resolve(blob) : reject(new Unreadable())),
					"image/jpeg",
					quality,
				),
			),
		PICTURE_BYTES_MAX,
	);
}
