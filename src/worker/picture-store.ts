import { and, eq } from "drizzle-orm";
import type { PictureId } from "@/pictures/picture";
import type { Db } from "./db";
import { picture } from "./db/picture-schema";
import type { Result } from "./result";

export type PictureError =
	| { code: "invalid"; field: "body" }
	| { code: "not_found" };

type PictureKind = "image/jpeg" | "image/png" | "image/webp";

const startsWith = (bytes: Uint8Array, head: number[], at = 0) =>
	head.every((byte, i) => bytes[at + i] === byte);

// The type comes from the first bytes, since a client can send any header.
function kindOf(bytes: Uint8Array): PictureKind | null {
	if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
	if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
		return "image/png";
	if (
		startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
		startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
	)
		return "image/webp";
	return null;
}

export async function addPicture(
	db: Db,
	bucket: R2Bucket,
	userId: string,
	bytes: ArrayBuffer,
): Promise<Result<{ id: PictureId }, PictureError>> {
	const kind = kindOf(new Uint8Array(bytes));
	if (kind === null)
		return { ok: false, error: { code: "invalid", field: "body" } };
	const id = crypto.randomUUID() as PictureId;
	await db.insert(picture).values({
		id,
		userId,
		ownedItemId: null,
		bytes: bytes.byteLength,
		createdAt: new Date(),
	});
	try {
		await bucket.put(id, bytes, { httpMetadata: { contentType: kind } });
	} catch (error) {
		// No row may point at no object.
		await db.delete(picture).where(eq(picture.id, id));
		throw error;
	}
	return { ok: true, value: { id } };
}

export async function readPicture(
	db: Db,
	bucket: R2Bucket,
	userId: string,
	id: string,
): Promise<Result<R2ObjectBody, PictureError>> {
	const [row] = await db
		.select({ id: picture.id })
		.from(picture)
		.where(and(eq(picture.id, id), eq(picture.userId, userId)));
	const object = row ? await bucket.get(id) : null;
	return object
		? { ok: true, value: object }
		: { ok: false, error: { code: "not_found" } };
}
