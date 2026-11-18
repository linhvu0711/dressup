import { and, count, eq, type SQL, sql } from "drizzle-orm";
import {
	ACCOUNT_PICTURE_LIMIT,
	MONTH_UPLOAD_STOP,
	type PictureId,
	STORAGE_BYTES_STOP,
} from "@/pictures/picture";
import type { Db } from "./db";
import { user } from "./db/auth-schema";
import {
	picture,
	pictureStorage,
	pictureUploadMonth,
} from "./db/picture-schema";
import type { Result } from "./result";

export type PictureError =
	| { code: "invalid"; field: "body" }
	| { code: "account_picture_limit" }
	| { code: "storage_full" }
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

// The two statements of every picture delete, for the caller's batch: the
// stored bytes go down by the rows about to go, then the rows go.
function dropPictures(db: Db, where: SQL | undefined) {
	return [
		db
			.update(pictureStorage)
			.set({
				bytes: sql`${pictureStorage.bytes} - (${db
					.select({ sum: sql`coalesce(sum(${picture.bytes}), 0)` })
					.from(picture)
					.where(where)})`,
			})
			.where(eq(pictureStorage.id, 1)),
		db.delete(picture).where(where).returning({ id: picture.id }),
	] as const;
}

const pictureCount = (db: Db, userId: string) =>
	db.select({ n: count() }).from(picture).where(eq(picture.userId, userId));

// The three checks sit in the insert, and the two counts rise in its batch
// only when the row was written, so two uploads at once cannot both pass a
// limit, and a refused upload counts nothing. The bucket put comes after,
// so a refused upload costs no R2 write.
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
	const size = bytes.byteLength;
	const month = new Date().toISOString().slice(0, 7);
	const [inserted] = await db.batch([
		db
			.insert(picture)
			.select(
				db
					.select({
						id: sql<string>`${id}`.as("id"),
						userId: user.id,
						ownedItemId: sql<null>`null`.as("owned_item_id"),
						bytes: sql<number>`${size}`.as("bytes"),
						// A select gets no column encoder, and bun:sqlite binds a Date as
						// null, so the time goes as a number.
						createdAt: sql<number>`${Date.now()}`.as("created_at"),
					})
					.from(user)
					.where(
						and(
							eq(user.id, userId),
							sql`(${pictureCount(db, userId)}) < ${ACCOUNT_PICTURE_LIMIT}`,
							sql`coalesce((${db
								.select({ bytes: pictureStorage.bytes })
								.from(pictureStorage)
								.where(
									eq(pictureStorage.id, 1),
								)}), 0) + ${size} <= ${STORAGE_BYTES_STOP}`,
							sql`coalesce((${db
								.select({ count: pictureUploadMonth.count })
								.from(pictureUploadMonth)
								.where(
									eq(pictureUploadMonth.month, month),
								)}), 0) < ${MONTH_UPLOAD_STOP}`,
						),
					),
			)
			.returning({ id: picture.id }),
		db
			.insert(pictureStorage)
			.select(
				db
					.select({
						id: sql<number>`1`.as("id"),
						bytes: sql<number>`${size}`.as("bytes"),
					})
					.from(picture)
					.where(eq(picture.id, id)),
			)
			.onConflictDoUpdate({
				target: pictureStorage.id,
				set: { bytes: sql`${pictureStorage.bytes} + excluded.bytes` },
			}),
		db
			.insert(pictureUploadMonth)
			.select(
				db
					.select({
						month: sql<string>`${month}`.as("month"),
						count: sql<number>`1`.as("count"),
					})
					.from(picture)
					.where(eq(picture.id, id)),
			)
			.onConflictDoUpdate({
				target: pictureUploadMonth.month,
				set: { count: sql`${pictureUploadMonth.count} + 1` },
			}),
	]);
	if (inserted.length === 0) {
		const [held] = await pictureCount(db, userId);
		return {
			ok: false,
			error: {
				code:
					(held?.n ?? 0) >= ACCOUNT_PICTURE_LIMIT
						? "account_picture_limit"
						: "storage_full",
			},
		};
	}
	try {
		await bucket.put(id, bytes, { httpMetadata: { contentType: kind } });
	} catch (error) {
		// No row may point at no object.
		await db.batch(dropPictures(db, eq(picture.id, id)));
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
