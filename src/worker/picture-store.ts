import {
	and,
	asc,
	count,
	eq,
	inArray,
	isNotNull,
	isNull,
	lt,
	notInArray,
	or,
	type SQL,
	sql,
} from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { z } from "zod";
import {
	ACCOUNT_PICTURE_LIMIT,
	DRAFT_AGE_MS,
	ITEM_PICTURE_LIMIT,
	MONTH_UPLOAD_STOP,
	type PictureId,
	pictureIdSchema,
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

// Why the picture list of an owner cannot be saved.
export type PictureListError =
	| { code: "invalid"; field: "pictureIds" }
	| { code: "picture_limit" };

export type PictureError =
	| { code: "invalid"; field: "body" }
	| PictureListError
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

type Statement = BatchItem<"sqlite">;

// R2 deletes at most 1,000 keys in one call. A failed delete is logged and
// not thrown: the rows are gone, and the 1 GB under the free amount holds a
// stray object.
async function removeObjects(bucket: R2Bucket, ids: string[]) {
	for (let i = 0; i < ids.length; i += 1000) {
		try {
			await bucket.delete(ids.slice(i, i + 1000));
		} catch (error) {
			console.error("picture objects were not deleted", error);
		}
	}
}

// One batch, so the owner's write, the pictures' rows, and the stored bytes
// change all or nothing; then the objects of the rows it deleted go.
async function runWithPictures(
	db: Db,
	bucket: R2Bucket,
	{
		before = [],
		drop,
		after = [],
	}: {
		before?: Statement[];
		drop: ReturnType<typeof dropPictures>;
		after?: Statement[];
	},
) {
	const results = (await db.batch([...before, ...drop, ...after] as [
		Statement,
		...Statement[],
	])) as unknown[];
	const dropped = (results[before.length + 1] as { id: string }[]).map(
		(row) => row.id,
	);
	await removeObjects(bucket, dropped);
	return {
		before: results.slice(0, before.length),
		dropped,
		after: results.slice(before.length + 2),
	};
}

const drafts = (userId: string) =>
	and(eq(picture.userId, userId), isNull(picture.ownedItemId));

async function sweepDrafts(db: Db, bucket: R2Bucket, userId: string) {
	await runWithPictures(db, bucket, {
		drop: dropPictures(
			db,
			and(
				drafts(userId),
				lt(picture.createdAt, new Date(Date.now() - DRAFT_AGE_MS)),
			),
		),
	});
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
	await sweepDrafts(db, bucket, userId);
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
	// An account delete during the put took the row; the object must go too.
	const [kept] = await db
		.select({ id: picture.id })
		.from(picture)
		.where(eq(picture.id, id));
	if (!kept) {
		await removeObjects(bucket, [id]);
		return { ok: false, error: { code: "not_found" } };
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

// Only a draft goes here; a saved picture goes with its owner's next save.
export async function deleteDraft(
	db: Db,
	bucket: R2Bucket,
	userId: string,
	id: string,
): Promise<Result<PictureId, PictureError>> {
	const { dropped } = await runWithPictures(db, bucket, {
		drop: dropPictures(db, and(drafts(userId), eq(picture.id, id))),
	});
	return dropped.length > 0
		? { ok: true, value: id as PictureId }
		: { ok: false, error: { code: "not_found" } };
}

// The saved pictures of the account's items, or of one item, each list in
// the order of upload; drafts never show.
export async function pictureIdsByItem(
	db: Db,
	userId: string,
	ownedItemId?: string,
): Promise<Map<string, PictureId[]>> {
	const rows = await db
		.select({ id: picture.id, ownedItemId: picture.ownedItemId })
		.from(picture)
		.where(
			and(
				eq(picture.userId, userId),
				ownedItemId === undefined
					? isNotNull(picture.ownedItemId)
					: eq(picture.ownedItemId, ownedItemId),
			),
		)
		// Two uploads in one millisecond share created_at; rowid keeps their order.
		.orderBy(asc(picture.createdAt), asc(sql`${picture}.rowid`));
	const byItem = new Map<string, PictureId[]>();
	for (const row of rows) {
		if (row.ownedItemId === null) continue;
		const ids = byItem.get(row.ownedItemId) ?? [];
		ids.push(row.id as PictureId);
		byItem.set(row.ownedItemId, ids);
	}
	return byItem;
}

const pictureIdsSchema = z.array(pictureIdSchema);

// Each id must be the account's draft or this owner's picture.
async function checkPictureList(
	db: Db,
	userId: string,
	ownedItemId: string,
	ids: string[],
): Promise<PictureListError | null> {
	const invalid = { code: "invalid", field: "pictureIds" } as const;
	if (
		!pictureIdsSchema.safeParse(ids).success ||
		new Set(ids).size !== ids.length
	)
		return invalid;
	if (ids.length > ITEM_PICTURE_LIMIT) return { code: "picture_limit" };
	if (ids.length === 0) return null;
	const [held] = await db
		.select({ n: count() })
		.from(picture)
		.where(
			and(
				eq(picture.userId, userId),
				inArray(picture.id, ids),
				or(isNull(picture.ownedItemId), eq(picture.ownedItemId, ownedItemId)),
			),
		);
	return held?.n === ids.length ? null : invalid;
}

export type PictureListSave = {
	userId: string;
	ownedItemId: string;
	// The whole list; undefined keeps the owner's pictures.
	ids: string[] | undefined;
	// The caller's exists on its own row as the owner write left it, so a
	// refused or gone owner takes no picture.
	itemHeld: SQL;
};

// The owner's write and its picture list in one batch: the owner first, so
// itemHeld sees it, then the drafts in the list attach, then the owner's
// pictures left out go, rows and objects; with itemHeld false, neither. It gives back the owner write's
// result.
export async function saveWithPictures<T extends Statement>(
	db: Db,
	bucket: R2Bucket,
	{ userId, ownedItemId, ids, itemHeld }: PictureListSave,
	owner: T,
): Promise<Result<Awaited<T>, PictureListError>> {
	if (ids === undefined)
		return { ok: true, value: (await owner) as Awaited<T> };
	const refused = await checkPictureList(db, userId, ownedItemId, ids);
	if (refused) return { ok: false, error: refused };
	const { before } = await runWithPictures(db, bucket, {
		before: [
			owner,
			db
				.update(picture)
				.set({ ownedItemId })
				.where(
					and(
						eq(picture.userId, userId),
						inArray(picture.id, ids),
						or(
							isNull(picture.ownedItemId),
							eq(picture.ownedItemId, ownedItemId),
						),
						itemHeld,
					),
				),
		],
		drop: dropPictures(
			db,
			and(
				eq(picture.userId, userId),
				eq(picture.ownedItemId, ownedItemId),
				notInArray(picture.id, ids),
				itemHeld,
			),
		),
	});
	return { ok: true, value: before[0] as Awaited<T> };
}

// The owner's delete with its pictures in one batch: the pictures' rows go
// first, so the owner's foreign key finds none and the stored bytes and the
// objects follow every picture. It gives back the owner delete's result.
export async function deleteWithPictures<T extends Statement>(
	db: Db,
	bucket: R2Bucket,
	scope: { userId: string; ownedItemId?: string },
	ownerDelete: T,
): Promise<Awaited<T>> {
	const { after } = await runWithPictures(db, bucket, {
		drop: dropPictures(
			db,
			and(
				eq(picture.userId, scope.userId),
				scope.ownedItemId === undefined
					? undefined
					: eq(picture.ownedItemId, scope.ownedItemId),
			),
		),
		after: [ownerDelete],
	});
	return after[0] as Awaited<T>;
}
