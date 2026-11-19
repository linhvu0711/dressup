import { and, count, desc, eq, exists, ne, notExists, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import {
	OWNED_ITEM_LIMIT,
	type OwnedItem,
	type OwnedItemId,
	ownedItemChangeSchema,
	ownedItemInputSchema,
} from "@/closet/owned-item";
import type { Hex } from "@/colour/hex";
import type { GarmentId } from "@/dress/garments";
import type { BrandId } from "@/labels/brand";
import type { ColourId } from "@/labels/colour";
import { brandOf } from "./brand-store";
import { colourOf } from "./colour-store";
import type { Db } from "./db";
import { user } from "./db/auth-schema";
import { brand } from "./db/brand-schema";
import { colour } from "./db/colour-schema";
import { ownedItem } from "./db/owned-item-schema";
import {
	deleteWithPictures,
	type PictureListError,
	pictureIdsByItem,
	saveWithPictures,
} from "./picture-store";
import type { Result } from "./result";

export type OwnedItemField =
	| "id"
	| "typeId"
	| "colourId"
	| "brandId"
	| "quantity"
	| "pictureIds"
	| "body";

export type OwnedItemError =
	| { code: "invalid"; field: OwnedItemField; value?: unknown }
	| { code: "duplicate"; id: OwnedItemId }
	| { code: "owned_item_limit" }
	| { code: "picture_limit" }
	| { code: "not_found" }
	| { code: "conflict" };

export type AddedOwnedItem = { ownedItem: OwnedItem; created: boolean };

type Piece = { typeId: GarmentId; colourId: string; brandId: string | null };

// The account's owned items, newest first, or the one with this id.
async function readOwnedItems(
	db: Db,
	userId: string,
	id?: string,
): Promise<OwnedItem[]> {
	const rows = await db
		.select({
			id: ownedItem.id,
			typeId: ownedItem.typeId,
			quantity: ownedItem.quantity,
			colourId: colour.id,
			colourName: colour.name,
			hex: colour.hex,
			brandId: brand.id,
			brandName: brand.name,
		})
		.from(ownedItem)
		.innerJoin(colour, eq(colour.id, ownedItem.colourId))
		.leftJoin(brand, eq(brand.id, ownedItem.brandId))
		.where(
			and(
				eq(ownedItem.userId, userId),
				id === undefined ? undefined : eq(ownedItem.id, id),
			),
		)
		// Two adds in one millisecond share created_at; rowid keeps their order.
		.orderBy(desc(ownedItem.createdAt), desc(sql`${ownedItem}.rowid`));
	const pictures = await pictureIdsByItem(db, userId, id);
	return rows.map((row) => ({
		id: row.id as OwnedItemId,
		typeId: row.typeId,
		colour: {
			id: row.colourId as ColourId,
			name: row.colourName,
			hex: row.hex as Hex,
		},
		brand:
			row.brandId === null || row.brandName === null
				? null
				: { id: row.brandId as BrandId, name: row.brandName },
		quantity: row.quantity,
		pictureIds: pictures.get(row.id) ?? [],
	}));
}

export const listOwnedItems = (db: Db, userId: string) =>
	readOwnedItems(db, userId);

const isField = (key: unknown): key is OwnedItemField =>
	key === "id" ||
	key === "typeId" ||
	key === "colourId" ||
	key === "brandId" ||
	key === "quantity" ||
	key === "pictureIds";

// The first bad field, with the value that was sent for it.
function invalid(
	input: unknown,
	path: readonly PropertyKey[],
): { ok: false; error: OwnedItemError } {
	const key = path[0];
	if (!isField(key))
		return { ok: false, error: { code: "invalid", field: "body" } };
	const value =
		typeof input === "object" && input !== null
			? (input as Record<string, unknown>)[key]
			: undefined;
	return { ok: false, error: { code: "invalid", field: key, value } };
}

// The account's items of one piece with one brand; `is` matches no brand
// to no brand.
const samePiece = (userId: string, piece: Piece) =>
	and(
		eq(ownedItem.userId, userId),
		eq(ownedItem.typeId, piece.typeId),
		eq(ownedItem.colourId, piece.colourId),
		sql`${ownedItem.brandId} is ${piece.brandId}`,
	);

const listRefusal = (
	error: PictureListError,
	ids: string[] | undefined,
): { ok: false; error: OwnedItemError } =>
	error.code === "picture_limit"
		? { ok: false, error: { code: "picture_limit" } }
		: {
				ok: false,
				error: { code: "invalid", field: "pictureIds", value: ids },
			};

// Why a write that the guards stopped did not happen, in the order a person
// would fix it. `otherThan` is the item a change writes, which holds its own
// piece and brand.
async function refusedWrite(
	db: Db,
	userId: string,
	piece: Piece,
	fallback: OwnedItemError,
	otherThan?: string,
): Promise<OwnedItemError> {
	const [ownColour] = await colourOf(db, userId, piece.colourId);
	if (!ownColour)
		return { code: "invalid", field: "colourId", value: piece.colourId };
	if (piece.brandId !== null) {
		const [ownBrand] = await brandOf(db, userId, piece.brandId);
		if (!ownBrand)
			return { code: "invalid", field: "brandId", value: piece.brandId };
	}
	const holders = await db
		.select({ id: ownedItem.id })
		.from(ownedItem)
		.where(samePiece(userId, piece));
	const held = holders.find((row) => row.id !== otherThan);
	return held ? { code: "duplicate", id: held.id as OwnedItemId } : fallback;
}

// The page makes the id when the form opens, so an add sent again after a
// lost answer gives back the same item rather than a second one, with the
// quantity sent last, as the person may have changed it before the retry;
// the same id with another piece or brand, or another account's id, is
// conflict. The
// colour, the brand, the limit, and the duplicate rule sit in the insert
// itself, so two adds at once cannot both pass them.
export async function addOwnedItem(
	db: Db,
	bucket: R2Bucket,
	userId: string,
	draft: unknown,
): Promise<Result<AddedOwnedItem, OwnedItemError>> {
	const parsed = ownedItemInputSchema.safeParse(draft);
	if (!parsed.success)
		return invalid(draft, parsed.error.issues[0]?.path ?? []);
	const input = parsed.data;
	const conflict = { ok: false, error: { code: "conflict" } } as const;
	// Only this account's item of this piece and brand takes the pictures, so
	// a conflict or a refused insert attaches none.
	const pictures = {
		userId,
		ownedItemId: input.id,
		ids: input.pictureIds,
		itemHeld: exists(
			db
				.select({ one: sql`1` })
				.from(ownedItem)
				.where(and(eq(ownedItem.id, input.id), samePiece(userId, input))),
		),
	};
	const [before] = await db
		.select({
			userId: ownedItem.userId,
			typeId: ownedItem.typeId,
			colourId: ownedItem.colourId,
			brandId: ownedItem.brandId,
		})
		.from(ownedItem)
		.where(eq(ownedItem.id, input.id));
	if (before) {
		const same =
			before.userId === userId &&
			before.typeId === input.typeId &&
			before.colourId === input.colourId &&
			before.brandId === input.brandId;
		if (!same) return conflict;
		const saved = await saveWithPictures(
			db,
			bucket,
			pictures,
			db
				.update(ownedItem)
				.set({ quantity: input.quantity })
				.where(and(eq(ownedItem.id, input.id), eq(ownedItem.userId, userId))),
		);
		if (!saved.ok) return listRefusal(saved.error, input.pictureIds);
		const [held] = await readOwnedItems(db, userId, input.id);
		return held
			? { ok: true, value: { ownedItem: held, created: false } }
			: conflict;
	}
	const saved = await saveWithPictures(
		db,
		bucket,
		pictures,
		db
			.insert(ownedItem)
			.select(
				db
					.select({
						id: sql<string>`${input.id}`.as("id"),
						userId: user.id,
						typeId: sql<string>`${input.typeId}`.as("type_id"),
						colourId: sql<string>`${input.colourId}`.as("colour_id"),
						brandId: sql<string | null>`${input.brandId}`.as("brand_id"),
						quantity: sql<number>`${input.quantity}`.as("quantity"),
						createdAt:
							sql<number>`(cast(unixepoch('subsecond') * 1000 as integer))`.as(
								"created_at",
							),
					})
					.from(user)
					.where(
						and(
							eq(user.id, userId),
							exists(colourOf(db, userId, input.colourId)),
							input.brandId === null
								? undefined
								: exists(brandOf(db, userId, input.brandId)),
							sql`(${db
								.select({ n: count() })
								.from(ownedItem)
								.where(eq(ownedItem.userId, userId))}) < ${OWNED_ITEM_LIMIT}`,
							notExists(
								db
									.select({ one: sql`1` })
									.from(ownedItem)
									.where(samePiece(userId, input)),
							),
						),
					),
			)
			.onConflictDoNothing({ target: ownedItem.id }),
	);
	if (!saved.ok) return listRefusal(saved.error, input.pictureIds);
	const [added] = await readOwnedItems(db, userId, input.id);
	if (added) return { ok: true, value: { ownedItem: added, created: true } };
	const [taken] = await db
		.select({ id: ownedItem.id })
		.from(ownedItem)
		.where(eq(ownedItem.id, input.id));
	if (taken) return conflict;
	return {
		ok: false,
		error: await refusedWrite(db, userId, input, { code: "owned_item_limit" }),
	};
}

// Only the brand and the quantity change; the piece stays. The brand and the
// duplicate rule sit in the update itself, as in the add. The duplicate rule
// holds only when the brand changes: a brand delete can leave two items of
// one piece with no brand, and each must still take a new quantity.
export async function changeOwnedItem(
	db: Db,
	bucket: R2Bucket,
	userId: string,
	id: string,
	draft: unknown,
): Promise<Result<OwnedItem, OwnedItemError>> {
	const parsed = ownedItemChangeSchema.safeParse(draft);
	if (!parsed.success)
		return invalid(draft, parsed.error.issues[0]?.path ?? []);
	const { brandId, quantity, pictureIds } = parsed.data;
	const other = alias(ownedItem, "other");
	const saved = await saveWithPictures(
		db,
		bucket,
		{
			userId,
			ownedItemId: id,
			ids: pictureIds,
			// The brand is the new one only when the update wrote, since it runs
			// first in the batch; a refused change attaches and drops nothing.
			itemHeld: exists(
				db
					.select({ one: sql`1` })
					.from(ownedItem)
					.where(
						and(
							eq(ownedItem.id, id),
							eq(ownedItem.userId, userId),
							sql`${ownedItem.brandId} is ${brandId}`,
						),
					),
			),
		},
		db
			.update(ownedItem)
			.set({ brandId, quantity })
			.where(
				and(
					eq(ownedItem.id, id),
					eq(ownedItem.userId, userId),
					brandId === null ? undefined : exists(brandOf(db, userId, brandId)),
					sql`(${ownedItem.brandId} is ${brandId} or ${notExists(
						db
							.select({ one: sql`1` })
							.from(other)
							.where(
								and(
									eq(other.userId, userId),
									eq(other.typeId, ownedItem.typeId),
									eq(other.colourId, ownedItem.colourId),
									sql`${other.brandId} is ${brandId}`,
									ne(other.id, ownedItem.id),
								),
							),
					)})`,
				),
			)
			.returning({ id: ownedItem.id }),
	);
	if (!saved.ok) return listRefusal(saved.error, pictureIds);
	const [row] = saved.value;
	if (row) {
		const [changed] = await readOwnedItems(db, userId, id);
		if (changed) return { ok: true, value: changed };
	}
	const [held] = await db
		.select({ typeId: ownedItem.typeId, colourId: ownedItem.colourId })
		.from(ownedItem)
		.where(and(eq(ownedItem.id, id), eq(ownedItem.userId, userId)));
	if (!held) return { ok: false, error: { code: "not_found" } };
	return {
		ok: false,
		error: await refusedWrite(
			db,
			userId,
			{ ...held, brandId },
			{ code: "conflict" },
			id,
		),
	};
}

// Only the account's own item goes; not found when the account has no item
// with this id.
export async function deleteOwnedItem(
	db: Db,
	bucket: R2Bucket,
	userId: string,
	id: string,
): Promise<Result<OwnedItemId, OwnedItemError>> {
	const [row] = await deleteWithPictures(
		db,
		bucket,
		{ userId, ownedItemId: id },
		db
			.delete(ownedItem)
			.where(and(eq(ownedItem.id, id), eq(ownedItem.userId, userId)))
			.returning({ id: ownedItem.id }),
	);
	return row
		? { ok: true, value: row.id as OwnedItemId }
		: { ok: false, error: { code: "not_found" } };
}
