import {
	and,
	asc,
	count,
	desc,
	eq,
	exists,
	ne,
	notExists,
	sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import {
	OWNED_ITEM_LIMIT,
	type OwnedItem,
	type OwnedItemId,
	ownedItemChangeSchema,
	ownedItemInputSchema,
	QUANTITY_MAX,
} from "@/closet/owned-item";
import type { Hex } from "@/colour/hex";
import type { PieceRef } from "@/combinations/marks";
import type { TypeId } from "@/dress/clothing-types";
import type { ColourId } from "@/labels/colour";
import { brandOf, brandOrNone } from "./brand-store";
import { colourOf } from "./colour-store";
import type { Db } from "./db";
import { brand } from "./db/brand-schema";
import { colour } from "./db/colour-schema";
import { ownedItem } from "./db/owned-item-schema";
import { shopLink, wish } from "./db/wish-schema";
import { guardedAdd, insertUnder } from "./guarded-add";
import {
	buyWithPictures,
	deleteOwner,
	type PictureListSave,
	pictureIdsBy,
	saveWithPictures,
} from "./picture-store";
import { pieceRefusal, samePiece } from "./piece-rows";
import { invalidField, type Result } from "./result";

type OwnedItemField =
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

type AddedOwnedItem = { ownedItem: OwnedItem; created: boolean };

type Piece = { typeId: TypeId; colourId: string; brandId: string | null };

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
	const pictures = await pictureIdsBy(db, userId, { kind: "ownedItem", id });
	return rows.map((row) => ({
		id: row.id as OwnedItemId,
		typeId: row.typeId,
		colour: {
			id: row.colourId as ColourId,
			name: row.colourName,
			hex: row.hex as Hex,
		},
		brand: brandOrNone(row.brandId, row.brandName),
		quantity: row.quantity,
		pictureIds: pictures.get(row.id) ?? [],
	}));
}

export const listOwnedItems = (db: Db, userId: string) =>
	readOwnedItems(db, userId);

// The pieces the account owns, for the Own marks: no brand, quantity, or
// pictures, which listOwnedItems reads too.
export async function listOwnedPieces(
	db: Db,
	userId: string,
): Promise<PieceRef[]> {
	const rows = await db
		.select({ typeId: ownedItem.typeId, colourId: ownedItem.colourId })
		.from(ownedItem)
		.where(eq(ownedItem.userId, userId));
	return rows.map((row) => ({
		typeId: row.typeId,
		colour: { id: row.colourId as ColourId },
	}));
}

const OWNED_ITEM_FIELDS: readonly OwnedItemField[] = [
	"id",
	"typeId",
	"colourId",
	"brandId",
	"quantity",
	"pictureIds",
];

// The account's items of one piece with one brand; `is` matches no brand
// to no brand.
const sameItem = (userId: string, piece: Piece) =>
	and(
		samePiece(ownedItem, userId, piece),
		sql`${ownedItem.brandId} is ${piece.brandId}`,
	);

// The colour, the brand, and the duplicate rule of an owned item's insert.
const itemGuards = (db: Db, userId: string, piece: Piece) => [
	exists(colourOf(db, userId, piece.colourId)),
	piece.brandId === null
		? undefined
		: exists(brandOf(db, userId, piece.brandId)),
	notExists(
		db.select({ one: sql`1` }).from(ownedItem).where(sameItem(userId, piece)),
	),
];

// The page makes the id when the form opens, so an add sent again after a
// lost answer gives back the same item rather than a second one, with the
// quantity sent last, as the person may have changed it before the retry;
// the same id with another piece or brand, or another account's id, is
// conflict. The colour, the brand, the limit, and the duplicate rule are the
// shared add's guards, so two adds at once cannot both pass them.
export async function addOwnedItem(
	db: Db,
	bucket: R2Bucket,
	userId: string,
	draft: unknown,
): Promise<Result<AddedOwnedItem, OwnedItemError>> {
	const parsed = ownedItemInputSchema.safeParse(draft);
	if (!parsed.success)
		return invalidField(
			OWNED_ITEM_FIELDS,
			draft,
			parsed.error.issues[0]?.path ?? [],
		);
	const input = parsed.data;
	// Only this account's item of this piece and brand takes the pictures, so
	// a conflict or a refused insert attaches none.
	const pictures: PictureListSave = {
		userId,
		owner: {
			kind: "ownedItem",
			id: input.id,
			holds: {
				typeId: input.typeId,
				colourId: input.colourId,
				brandId: input.brandId,
			},
		},
		ids: input.pictureIds,
	};
	const added = await guardedAdd(db, {
		table: ownedItem,
		userId,
		id: input.id,
		mine: sameItem(userId, input),
		values: {
			typeId: input.typeId,
			colourId: input.colourId,
			brandId: input.brandId,
			quantity: input.quantity,
			writeId: null,
		},
		guards: itemGuards(db, userId, input),
		limit: { max: OWNED_ITEM_LIMIT, code: "owned_item_limit" },
		write: (insert) => saveWithPictures(db, bucket, pictures, insert),
		resend: () =>
			saveWithPictures(
				db,
				bucket,
				pictures,
				db
					.update(ownedItem)
					.set({ quantity: input.quantity })
					.where(and(eq(ownedItem.id, input.id), eq(ownedItem.userId, userId))),
			),
		read: async () => (await readOwnedItems(db, userId, input.id))[0],
		refused: (): Promise<OwnedItemError | null> =>
			pieceRefusal(
				db,
				userId,
				{ table: ownedItem, where: sameItem(userId, input) },
				input,
			),
	});
	return added.ok
		? {
				ok: true,
				value: {
					ownedItem: added.value.value,
					created: added.value.created,
				},
			}
		: added;
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
		return invalidField(
			OWNED_ITEM_FIELDS,
			draft,
			parsed.error.issues[0]?.path ?? [],
		);
	const { brandId, quantity, pictureIds } = parsed.data;
	const other = alias(ownedItem, "other");
	const saved = await saveWithPictures(
		db,
		bucket,
		{
			userId,
			// The item holds the new brand only when the update wrote, since it
			// runs first in the batch; a refused change attaches and drops nothing.
			owner: { kind: "ownedItem", id, holds: { brandId } },
			ids: pictureIds,
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
	if (!saved.ok) return saved;
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
	const piece = { ...held, brandId };
	return {
		ok: false,
		// The item holds its own piece and brand, so it is not a duplicate.
		error: (await pieceRefusal<OwnedItemId>(
			db,
			userId,
			{ table: ownedItem, where: sameItem(userId, piece) },
			piece,
			id,
		)) ?? { code: "conflict" },
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
	const deleted = await deleteOwner(db, bucket, userId, {
		kind: "ownedItem",
		id,
	});
	return deleted.ok
		? { ok: true, value: deleted.value as OwnedItemId }
		: deleted;
}

export type BoughtError =
	| { code: "not_found" }
	| { code: "owned_item_limit" }
	| { code: "quantity_limit" }
	| { code: "conflict" };

// Bought: the link becomes an owned item of its wish's piece with its brand
// and pictures, or adds 1 to the item of that piece and brand, and the wish
// goes with its other links. Every write is guarded by the link and the item
// as they were read, so a link or an item changed since writes nothing.
export async function buyShopLink(
	db: Db,
	bucket: R2Bucket,
	userId: string,
	shopLinkId: string,
): Promise<Result<AddedOwnedItem, BoughtError>> {
	const [link] = await db
		.select({
			wishId: wish.id,
			typeId: wish.typeId,
			colourId: wish.colourId,
			brandId: shopLink.brandId,
		})
		.from(shopLink)
		.innerJoin(wish, eq(wish.id, shopLink.wishId))
		.where(and(eq(shopLink.id, shopLinkId), eq(shopLink.userId, userId)));
	if (!link) return { ok: false, error: { code: "not_found" } };
	const { wishId, ...piece } = link;
	const linkHeld = exists(
		db
			.select({ one: sql`1` })
			.from(shopLink)
			.where(
				and(
					eq(shopLink.id, shopLinkId),
					eq(shopLink.userId, userId),
					eq(shopLink.wishId, wishId),
					sql`${shopLink.brandId} is ${piece.brandId}`,
				),
			),
	);
	const [found] = await db
		.select({ id: ownedItem.id, quantity: ownedItem.quantity })
		.from(ownedItem)
		.where(sameItem(userId, piece))
		.orderBy(asc(ownedItem.createdAt), asc(sql`rowid`))
		.limit(1);
	if (found && found.quantity >= QUANTITY_MAX) {
		return { ok: false, error: { code: "quantity_limit" } };
	}
	const id = found?.id ?? crypto.randomUUID();
	const writeId = crypto.randomUUID();
	const ownerWrite = found
		? db
				.update(ownedItem)
				.set({ quantity: found.quantity + 1, writeId })
				.where(
					and(
						eq(ownedItem.id, id),
						eq(ownedItem.userId, userId),
						eq(ownedItem.quantity, found.quantity),
						linkHeld,
					),
				)
				.returning({ id: ownedItem.id })
		: insertUnder(db, ownedItem, {
				userId,
				id,
				values: { ...piece, quantity: 1, writeId },
				guards: [...itemGuards(db, userId, piece), linkHeld],
				limit: { max: OWNED_ITEM_LIMIT },
			})
				.onConflictDoNothing()
				.returning({ id: ownedItem.id });
	const [row] = await buyWithPictures(
		db,
		bucket,
		{
			userId,
			link: { id: shopLinkId, wishId, brandId: piece.brandId },
			item: { id, writeId },
		},
		ownerWrite,
	);
	if (row) {
		const [bought] = await readOwnedItems(db, userId, id);
		if (bought) {
			return { ok: true, value: { ownedItem: bought, created: !found } };
		}
	}
	return {
		ok: false,
		error: await refusedBuy(db, userId, shopLinkId, !found),
	};
}

// Why a Bought that the guards stopped did not happen.
async function refusedBuy(
	db: Db,
	userId: string,
	shopLinkId: string,
	inserted: boolean,
): Promise<BoughtError> {
	const [link] = await db
		.select({ id: shopLink.id })
		.from(shopLink)
		.where(and(eq(shopLink.id, shopLinkId), eq(shopLink.userId, userId)));
	if (!link) return { code: "not_found" };
	if (!inserted) return { code: "conflict" };
	const [held] = await db
		.select({ n: count() })
		.from(ownedItem)
		.where(eq(ownedItem.userId, userId));
	return (held?.n ?? 0) >= OWNED_ITEM_LIMIT
		? { code: "owned_item_limit" }
		: { code: "conflict" };
}
