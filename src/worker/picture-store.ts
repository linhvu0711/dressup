import {
	and,
	asc,
	type Column,
	count,
	eq,
	exists,
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
import { ownedItem } from "./db/owned-item-schema";
import {
	picture,
	pictureStorage,
	pictureUploadMonth,
} from "./db/picture-schema";
import { shopLink, wish } from "./db/wish-schema";
import type { Result } from "./result";

// Why the picture list of an owner cannot be saved.
export type PictureListError =
	| { code: "invalid"; field: "pictureIds" }
	| { code: "picture_limit" };

export type AddPictureError =
	| { code: "invalid"; field: "body" }
	| { code: "account_picture_limit" }
	| { code: "storage_full" }
	| { code: "not_found" };

// The one owner of a saved picture.
type PictureOwner = { kind: "ownedItem" | "shopLink"; id: string };

// A save's owner, with the values its row holds once the owner's write ran,
// so a refused, changed, or gone owner takes no picture.
export type HeldOwner =
	| {
			kind: "ownedItem";
			id: string;
			holds: Partial<
				Pick<
					typeof ownedItem.$inferSelect,
					"typeId" | "colourId" | "brandId" | "writeId"
				>
			>;
	  }
	| {
			kind: "shopLink";
			id: string;
			holds: Partial<
				Pick<typeof shopLink.$inferSelect, "wishId" | "brandId" | "writeId">
			>;
	  };

const ownerIs = (owner: PictureOwner) =>
	owner.kind === "ownedItem"
		? eq(picture.ownedItemId, owner.id)
		: eq(picture.shopLinkId, owner.id);

// Both keys, so a picture never keeps a second owner.
const ownedBy = (owner: PictureOwner) => ({
	ownedItemId: owner.kind === "ownedItem" ? owner.id : null,
	shopLinkId: owner.kind === "shopLink" ? owner.id : null,
});

// `is`, so a null brand matches a null brand.
const holding = <C extends string>(
	columns: NoInfer<Record<C, Column>>,
	holds: Partial<Record<C, unknown>>,
) =>
	Object.entries(holds).map(
		([key, value]) => sql`${columns[key as C]} is ${value}`,
	);

function ownerHeld(db: Db, userId: string, owner: HeldOwner) {
	if (owner.kind === "ownedItem")
		return exists(
			db
				.select({ one: sql`1` })
				.from(ownedItem)
				.where(
					and(
						eq(ownedItem.id, owner.id),
						eq(ownedItem.userId, userId),
						...holding(ownedItem, owner.holds),
					),
				),
		);
	return exists(
		db
			.select({ one: sql`1` })
			.from(shopLink)
			.where(
				and(
					eq(shopLink.id, owner.id),
					eq(shopLink.userId, userId),
					...holding(shopLink, owner.holds),
				),
			),
	);
}

const isDraft = and(isNull(picture.ownedItemId), isNull(picture.shopLinkId));

// The pictures of every shop link of one wish.
const ofWish = (db: Db, wishId: string) =>
	inArray(
		picture.shopLinkId,
		db
			.select({ id: shopLink.id })
			.from(shopLink)
			.where(eq(shopLink.wishId, wishId)),
	);

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

const drafts = (userId: string) => and(eq(picture.userId, userId), isDraft);

async function sweepDrafts(db: Db, bucket: R2Bucket, userId: string) {
	const [, dropped] = await db.batch(
		dropPictures(
			db,
			and(
				drafts(userId),
				lt(picture.createdAt, new Date(Date.now() - DRAFT_AGE_MS)),
			),
		),
	);
	await removeObjects(
		bucket,
		dropped.map((row) => row.id),
	);
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
): Promise<Result<{ id: PictureId }, AddPictureError>> {
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
						shopLinkId: sql<null>`null`.as("shop_link_id"),
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
		// No row may point at no object. An upload that stored nothing does not
		// count toward the month's stop either, so an R2 outage cannot use it up.
		await db.batch([
			db
				.update(pictureUploadMonth)
				.set({
					count: sql`${pictureUploadMonth.count} - (${db
						.select({ n: sql`count(*)` })
						.from(picture)
						.where(eq(picture.id, id))})`,
				})
				.where(eq(pictureUploadMonth.month, month)),
			...dropPictures(db, eq(picture.id, id)),
		]);
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
): Promise<Result<R2ObjectBody, { code: "not_found" }>> {
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
): Promise<Result<PictureId, { code: "not_found" }>> {
	const [, dropped] = await db.batch(
		dropPictures(db, and(drafts(userId), eq(picture.id, id))),
	);
	await removeObjects(
		bucket,
		dropped.map((row) => row.id),
	);
	return dropped.length > 0
		? { ok: true, value: id as PictureId }
		: { ok: false, error: { code: "not_found" } };
}

// The saved pictures of the account's items or links, or of one item, or of
// one wish's links, each list in the order of upload; drafts never show.
export async function pictureIdsBy(
	db: Db,
	userId: string,
	of: { kind: "ownedItem" | "wish"; id: string | undefined },
): Promise<Map<string, PictureId[]>> {
	const owner = of.kind === "wish" ? picture.shopLinkId : picture.ownedItemId;
	const { id } = of;
	const rows = await db
		.select({ id: picture.id, owner })
		.from(picture)
		.where(
			and(
				eq(picture.userId, userId),
				id === undefined
					? isNotNull(owner)
					: of.kind === "wish"
						? ofWish(db, id)
						: eq(owner, id),
			),
		)
		// Two uploads in one millisecond share created_at; rowid keeps their order.
		.orderBy(asc(picture.createdAt), asc(sql`${picture}.rowid`));
	const byOwner = new Map<string, PictureId[]>();
	for (const row of rows) {
		if (row.owner === null) continue;
		const ids = byOwner.get(row.owner) ?? [];
		ids.push(row.id as PictureId);
		byOwner.set(row.owner, ids);
	}
	return byOwner;
}

const pictureIdsSchema = z.array(pictureIdSchema);

// Each id must be the account's draft or this owner's picture.
async function checkPictureList(
	db: Db,
	userId: string,
	owner: PictureOwner,
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
				or(isDraft, ownerIs(owner)),
			),
		);
	return held?.n === ids.length ? null : invalid;
}

export type PictureListSave = {
	userId: string;
	owner: HeldOwner;
	// The whole list; undefined keeps the owner's pictures.
	ids: string[] | undefined;
};

// The owner's write and its picture list in one batch: the owner first, so
// the owner check sees it, then the drafts in the list attach, then the
// owner's pictures left out go, rows and objects; with the check false,
// neither. A parent write, the row the owner hangs under, as a new wish under
// its first shop link, runs before the owner in the same batch. It gives back
// the owner write's result.
export async function saveWithPictures<T extends Statement>(
	db: Db,
	bucket: R2Bucket,
	{ userId, owner, ids }: PictureListSave,
	ownerWrite: T,
	parentWrite?: Statement,
): Promise<Result<Awaited<T>, PictureListError>> {
	if (ids === undefined) {
		if (!parentWrite)
			return { ok: true, value: (await ownerWrite) as Awaited<T> };
		const [, written] = await db.batch([parentWrite, ownerWrite]);
		return { ok: true, value: written as Awaited<T> };
	}
	const refused = await checkPictureList(db, userId, owner, ids);
	if (refused) return { ok: false, error: refused };
	const held = ownerHeld(db, userId, owner);
	const writes: [Statement, ...Statement[]] = [
		ownerWrite,
		db
			.update(picture)
			.set(ownedBy(owner))
			.where(
				and(
					eq(picture.userId, userId),
					inArray(picture.id, ids),
					or(isDraft, ownerIs(owner)),
					held,
				),
			),
		...dropPictures(
			db,
			and(
				eq(picture.userId, userId),
				ownerIs(owner),
				notInArray(picture.id, ids),
				held,
			),
		),
	];
	const results = await db.batch(
		parentWrite ? [parentWrite, ...writes] : writes,
	);
	const [written, , , dropped] = results.slice(parentWrite ? 1 : 0) as [
		unknown,
		unknown,
		unknown,
		{ id: string }[],
	];
	await removeObjects(
		bucket,
		dropped.map((row) => row.id),
	);
	return { ok: true, value: written as Awaited<T> };
}

// The owner's delete with its pictures in one batch: the pictures' rows go
// first, so the owner's foreign key finds none and the stored bytes and the
// objects follow every picture. The writes after run in the same batch, once
// the owner is gone. It gives back the owner delete's result.
export async function deleteWithPictures<T extends Statement>(
	db: Db,
	bucket: R2Bucket,
	{
		userId,
		owner,
	}: {
		userId: string;
		owner: PictureOwner | { kind: "wish"; id: string } | { kind: "account" };
	},
	ownerDelete: T,
	...after: Statement[]
): Promise<Awaited<T>> {
	const [, dropped, deleted] = await db.batch([
		...dropPictures(
			db,
			and(
				eq(picture.userId, userId),
				owner.kind === "account"
					? undefined
					: owner.kind === "wish"
						? ofWish(db, owner.id)
						: ownerIs(owner),
			),
		),
		ownerDelete,
		...after,
	]);
	await removeObjects(
		bucket,
		dropped.map((row) => row.id),
	);
	return deleted as Awaited<T>;
}

// Only the account's own owned item, shop link, or wish goes, with its
// pictures, and the writes after in the same batch; not found when the
// account has no such row.
export async function deleteOwner(
	db: Db,
	bucket: R2Bucket,
	userId: string,
	owner: PictureOwner | { kind: "wish"; id: string },
	...after: Statement[]
): Promise<Result<string, { code: "not_found" }>> {
	const table =
		owner.kind === "ownedItem"
			? ownedItem
			: owner.kind === "shopLink"
				? shopLink
				: wish;
	const [row] = await deleteWithPictures(
		db,
		bucket,
		{ userId, owner },
		db
			.delete(table)
			.where(and(eq(table.id, owner.id), eq(table.userId, userId)))
			.returning({ id: table.id }),
		...after,
	);
	return row
		? { ok: true, value: row.id }
		: { ok: false, error: { code: "not_found" } };
}

// The Bought batch. The item write runs first, so the check sees it; then
// the link's oldest pictures move to the item while it has room, before the
// drop, so the kept ones stay; the wish goes last, with its other links,
// once no picture points at them. Each picture write and the wish delete
// run only while the link is as it was read and the item holds the write id
// the write set. The objects go only after the batch commits, so a failure
// deletes no object, and no row is left with no object. It gives back the
// item write's result.
export async function buyWithPictures<T extends Statement>(
	db: Db,
	bucket: R2Bucket,
	{
		userId,
		link,
		item,
	}: {
		userId: string;
		link: { id: string; wishId: string; brandId: string | null };
		item: { id: string; writeId: string };
	},
	itemWrite: T,
): Promise<Awaited<T>> {
	const held = and(
		ownerHeld(db, userId, {
			kind: "shopLink",
			id: link.id,
			holds: { wishId: link.wishId, brandId: link.brandId },
		}),
		ownerHeld(db, userId, {
			kind: "ownedItem",
			id: item.id,
			holds: { writeId: item.writeId },
		}),
	);
	const removeWish = db
		.delete(wish)
		.where(and(eq(wish.id, link.wishId), eq(wish.userId, userId), held));
	const [written, , , dropped] = await db.batch([
		itemWrite,
		db
			.update(picture)
			.set(ownedBy({ kind: "ownedItem", id: item.id }))
			.where(
				and(
					eq(picture.userId, userId),
					sql`${picture.id} in (select ${picture.id} from ${picture} where ${picture.shopLinkId} = ${link.id} order by ${picture.createdAt}, rowid limit max(0, ${ITEM_PICTURE_LIMIT} - (select count(*) from ${picture} where ${picture.ownedItemId} = ${item.id})))`,
					held,
				),
			),
		...dropPictures(
			db,
			and(eq(picture.userId, userId), ofWish(db, link.wishId), held),
		),
		removeWish,
	]);
	await removeObjects(
		bucket,
		dropped.map((row) => row.id),
	);
	return written as Awaited<T>;
}
