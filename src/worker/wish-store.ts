import { and, asc, count, desc, eq, exists, notExists, sql } from "drizzle-orm";
import type { Hex } from "@/colour/hex";
import type { PieceRef } from "@/combinations/marks";
import type { TypeId } from "@/dress/clothing-types";
import type { BrandId } from "@/labels/brand";
import type { ColourId } from "@/labels/colour";
import {
	SHOP_LINK_LIMIT,
	type ShopLink,
	type ShopLinkId,
	shopLinkChangeSchema,
	shopLinkInputSchema,
	WISH_LIMIT,
	type Wish,
	type WishId,
	wishInputSchema,
} from "@/wishlist/wish";
import { brandOf } from "./brand-store";
import { colourOf } from "./colour-store";
import type { Db } from "./db";
import { user } from "./db/auth-schema";
import { brand } from "./db/brand-schema";
import { colour } from "./db/colour-schema";
import { shopLink, wish } from "./db/wish-schema";
import {
	deleteWithPictures,
	type PictureListError,
	pictureIdsBy,
	saveWithPictures,
} from "./picture-store";
import type { Result } from "./result";

type WishField =
	| "id"
	| "typeId"
	| "colourId"
	| "url"
	| "brandId"
	| "name"
	| "price"
	| "pictureIds"
	| "body";

export type WishError =
	| { code: "invalid"; field: WishField; value?: unknown }
	| { code: "duplicate"; id: WishId }
	| { code: "wish_limit" }
	| { code: "shop_link_limit" }
	| { code: "picture_limit" }
	| { code: "conflict" }
	| { code: "not_found" };

type AddedWish = { wish: Wish; created: boolean };

type Piece = { typeId: TypeId; colourId: string };

// The account's wishes, newest first, or the one with this id.
async function readWishes(
	db: Db,
	userId: string,
	id?: string,
): Promise<Wish[]> {
	const rows = await db
		.select({
			id: wish.id,
			typeId: wish.typeId,
			colourId: colour.id,
			colourName: colour.name,
			hex: colour.hex,
		})
		.from(wish)
		.innerJoin(colour, eq(colour.id, wish.colourId))
		.where(
			and(
				eq(wish.userId, userId),
				id === undefined ? undefined : eq(wish.id, id),
			),
		)
		// Two adds in one millisecond share created_at; rowid keeps their order.
		.orderBy(desc(wish.createdAt), desc(sql`${wish}.rowid`));
	const links = await readShopLinks(db, userId, id);
	return rows.map((row) => ({
		id: row.id as WishId,
		typeId: row.typeId,
		colour: {
			id: row.colourId as ColourId,
			name: row.colourName,
			hex: row.hex as Hex,
		},
		shopLinks: links.get(row.id) ?? [],
	}));
}

// The shop links of the account's wishes, or of the one with this id, each
// wish's oldest first, the order the user added them.
async function readShopLinks(
	db: Db,
	userId: string,
	wishId?: string,
): Promise<Map<string, ShopLink[]>> {
	const byWish = new Map<string, ShopLink[]>();
	const pictures = await pictureIdsBy(db, userId, "shopLinkId");
	const rows = await db
		.select({
			id: shopLink.id,
			wishId: shopLink.wishId,
			url: shopLink.url,
			name: shopLink.name,
			price: shopLink.price,
			brandId: brand.id,
			brandName: brand.name,
		})
		.from(shopLink)
		.leftJoin(brand, eq(brand.id, shopLink.brandId))
		.where(
			and(
				eq(shopLink.userId, userId),
				wishId === undefined ? undefined : eq(shopLink.wishId, wishId),
			),
		)
		.orderBy(asc(shopLink.createdAt), asc(sql`${shopLink}.rowid`));
	for (const row of rows) {
		const link: ShopLink = {
			id: row.id as ShopLinkId,
			url: row.url,
			brand:
				row.brandId === null || row.brandName === null
					? null
					: { id: row.brandId as BrandId, name: row.brandName },
			name: row.name,
			price: row.price,
			pictureIds: pictures.get(row.id) ?? [],
		};
		const held = byWish.get(row.wishId);
		if (held) held.push(link);
		else byWish.set(row.wishId, [link]);
	}
	return byWish;
}

export const listWishes = (db: Db, userId: string) => readWishes(db, userId);

// The pieces the account wants, for the Want marks: no shop links, which
// listWishes reads too.
export async function listWishedPieces(
	db: Db,
	userId: string,
): Promise<PieceRef[]> {
	const rows = await db
		.select({ typeId: wish.typeId, colourId: wish.colourId })
		.from(wish)
		.where(eq(wish.userId, userId));
	return rows.map((row) => ({
		typeId: row.typeId,
		colour: { id: row.colourId as ColourId },
	}));
}

const FIELDS: readonly WishField[] = [
	"id",
	"typeId",
	"colourId",
	"url",
	"brandId",
	"name",
	"price",
	"pictureIds",
];

const isField = (key: unknown): key is WishField =>
	FIELDS.includes(key as WishField);

// The first bad field, with the value that was sent for it.
function invalid(
	input: unknown,
	path: readonly PropertyKey[],
): { ok: false; error: WishError } {
	const key = path[0];
	if (!isField(key))
		return { ok: false, error: { code: "invalid", field: "body" } };
	const value =
		typeof input === "object" && input !== null
			? (input as Record<string, unknown>)[key]
			: undefined;
	return { ok: false, error: { code: "invalid", field: key, value } };
}

const listRefusal = (
	error: PictureListError,
	ids: string[] | undefined,
): { ok: false; error: WishError } =>
	error.code === "picture_limit"
		? { ok: false, error: { code: "picture_limit" } }
		: {
				ok: false,
				error: { code: "invalid", field: "pictureIds", value: ids },
			};

const samePiece = (userId: string, piece: Piece) =>
	and(
		eq(wish.userId, userId),
		eq(wish.typeId, piece.typeId),
		eq(wish.colourId, piece.colourId),
	);

// Why an add that the guards stopped did not happen, in the order a person
// would fix it.
async function refusedWrite(
	db: Db,
	userId: string,
	piece: Piece,
): Promise<WishError> {
	const [ownColour] = await colourOf(db, userId, piece.colourId);
	if (!ownColour)
		return { code: "invalid", field: "colourId", value: piece.colourId };
	const [held] = await db
		.select({ id: wish.id })
		.from(wish)
		.where(samePiece(userId, piece));
	return held
		? { code: "duplicate", id: held.id as WishId }
		: { code: "wish_limit" };
}

// The page makes the id when the form opens, so an add sent again after a
// lost answer gives back the same wish rather than a second one; the same id
// with another piece, or another account's id, is conflict. The colour, the
// limit, and the duplicate rule sit in the insert itself, so two adds at once
// cannot both pass them; the unique index turns a lost race on one piece into
// no row too.
export async function addWish(
	db: Db,
	userId: string,
	draft: unknown,
): Promise<Result<AddedWish, WishError>> {
	const parsed = wishInputSchema.safeParse(draft);
	if (!parsed.success)
		return invalid(draft, parsed.error.issues[0]?.path ?? []);
	const input = parsed.data;
	const conflict = { ok: false, error: { code: "conflict" } } as const;
	const [before] = await db
		.select({
			userId: wish.userId,
			typeId: wish.typeId,
			colourId: wish.colourId,
		})
		.from(wish)
		.where(eq(wish.id, input.id));
	if (before) {
		const same =
			before.userId === userId &&
			before.typeId === input.typeId &&
			before.colourId === input.colourId;
		if (!same) return conflict;
		const [held] = await readWishes(db, userId, input.id);
		return held
			? { ok: true, value: { wish: held, created: false } }
			: conflict;
	}
	await db
		.insert(wish)
		.select(
			db
				.select({
					id: sql<string>`${input.id}`.as("id"),
					userId: user.id,
					typeId: sql<string>`${input.typeId}`.as("type_id"),
					colourId: sql<string>`${input.colourId}`.as("colour_id"),
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
						sql`(${db
							.select({ n: count() })
							.from(wish)
							.where(eq(wish.userId, userId))}) < ${WISH_LIMIT}`,
						notExists(
							db
								.select({ one: sql`1` })
								.from(wish)
								.where(samePiece(userId, input)),
						),
					),
				),
		)
		.onConflictDoNothing();
	const [added] = await readWishes(db, userId, input.id);
	if (added) return { ok: true, value: { wish: added, created: true } };
	const [taken] = await db
		.select({ id: wish.id })
		.from(wish)
		.where(eq(wish.id, input.id));
	if (taken) return conflict;
	return { ok: false, error: await refusedWrite(db, userId, input) };
}

// Only the account's own wish goes; not found when the account has no wish
// with this id.
export async function deleteWish(
	db: Db,
	bucket: R2Bucket,
	userId: string,
	id: string,
): Promise<Result<WishId, WishError>> {
	const [row] = await deleteWithPictures(
		db,
		bucket,
		{ userId, owner: { wishId: id } },
		db
			.delete(wish)
			.where(and(eq(wish.id, id), eq(wish.userId, userId)))
			.returning({ id: wish.id }),
	);
	return row
		? { ok: true, value: row.id as WishId }
		: { ok: false, error: { code: "not_found" } };
}

type AddedShopLink = AddedWish;

const linksOfWish = (db: Db, wishId: string) =>
	db.select({ n: count() }).from(shopLink).where(eq(shopLink.wishId, wishId));

// The same replay rule as a wish: the same id on the same wish gives back
// the wish; the same id anywhere else is conflict. The wish, the brand, and
// the limit sit in the insert itself, so two adds at once cannot both pass
// them.
export async function addShopLink(
	db: Db,
	bucket: R2Bucket,
	userId: string,
	wishId: string,
	draft: unknown,
): Promise<Result<AddedShopLink, WishError>> {
	const parsed = shopLinkInputSchema.safeParse(draft);
	if (!parsed.success)
		return invalid(draft, parsed.error.issues[0]?.path ?? []);
	const input = parsed.data;
	const conflict = { ok: false, error: { code: "conflict" } } as const;
	const [before] = await db
		.select({ userId: shopLink.userId, wishId: shopLink.wishId })
		.from(shopLink)
		.where(eq(shopLink.id, input.id));
	if (before) {
		if (before.userId !== userId || before.wishId !== wishId) return conflict;
		const [held] = await readWishes(db, userId, wishId);
		return held
			? { ok: true, value: { wish: held, created: false } }
			: conflict;
	}
	// Only this account's new link on this wish takes the pictures, so a
	// conflict or a refused insert attaches none.
	const saved = await saveWithPictures(
		db,
		bucket,
		{
			userId,
			owner: { shopLinkId: input.id },
			ids: input.pictureIds,
			itemHeld: exists(
				db
					.select({ one: sql`1` })
					.from(shopLink)
					.where(
						and(
							eq(shopLink.id, input.id),
							eq(shopLink.userId, userId),
							eq(shopLink.wishId, wishId),
						),
					),
			),
		},
		db
			.insert(shopLink)
			.select(
				db
					.select({
						id: sql<string>`${input.id}`.as("id"),
						userId: wish.userId,
						wishId: wish.id,
						url: sql<string>`${input.url}`.as("url"),
						brandId: sql<string | null>`${input.brandId}`.as("brand_id"),
						name: sql<string>`${input.name}`.as("name"),
						price: sql<number | null>`${input.price}`.as("price"),
						createdAt:
							sql<number>`(cast(unixepoch('subsecond') * 1000 as integer))`.as(
								"created_at",
							),
					})
					.from(wish)
					.where(
						and(
							eq(wish.id, wishId),
							eq(wish.userId, userId),
							input.brandId === null
								? undefined
								: exists(brandOf(db, userId, input.brandId)),
							sql`(${linksOfWish(db, wishId)}) < ${SHOP_LINK_LIMIT}`,
						),
					),
			)
			.onConflictDoNothing(),
	);
	if (!saved.ok) return listRefusal(saved.error, input.pictureIds);
	const [added] = await db
		.select({ wishId: shopLink.wishId })
		.from(shopLink)
		.where(and(eq(shopLink.id, input.id), eq(shopLink.userId, userId)));
	if (added) {
		const [held] = await readWishes(db, userId, wishId);
		if (held) return { ok: true, value: { wish: held, created: true } };
	}
	const [taken] = await db
		.select({ id: shopLink.id })
		.from(shopLink)
		.where(eq(shopLink.id, input.id));
	if (taken) return conflict;
	return { ok: false, error: await refusedLink(db, userId, wishId, input) };
}

// Why a shop link add that the guards stopped did not happen, in the order
// a person would fix it.
async function refusedLink(
	db: Db,
	userId: string,
	wishId: string,
	input: { brandId: string | null },
): Promise<WishError> {
	const [ownWish] = await db
		.select({ id: wish.id })
		.from(wish)
		.where(and(eq(wish.id, wishId), eq(wish.userId, userId)));
	if (!ownWish) return { code: "not_found" };
	if (input.brandId !== null) {
		const [ownBrand] = await brandOf(db, userId, input.brandId);
		if (!ownBrand)
			return { code: "invalid", field: "brandId", value: input.brandId };
	}
	return { code: "shop_link_limit" };
}

// Every field of a link may change; the wish it belongs to stays. The brand
// check sits in the update itself, as in the add.
export async function changeShopLink(
	db: Db,
	bucket: R2Bucket,
	userId: string,
	id: string,
	draft: unknown,
): Promise<Result<Wish, WishError>> {
	const parsed = shopLinkChangeSchema.safeParse(draft);
	if (!parsed.success)
		return invalid(draft, parsed.error.issues[0]?.path ?? []);
	const { pictureIds, ...input } = parsed.data;
	const saved = await saveWithPictures(
		db,
		bucket,
		{
			userId,
			owner: { shopLinkId: id },
			ids: pictureIds,
			// The brand is the new one only when the update wrote, since it runs
			// first in the batch; a refused change attaches and drops nothing.
			itemHeld: exists(
				db
					.select({ one: sql`1` })
					.from(shopLink)
					.where(
						and(
							eq(shopLink.id, id),
							eq(shopLink.userId, userId),
							sql`${shopLink.brandId} is ${input.brandId}`,
						),
					),
			),
		},
		db
			.update(shopLink)
			.set(input)
			.where(
				and(
					eq(shopLink.id, id),
					eq(shopLink.userId, userId),
					input.brandId === null
						? undefined
						: exists(brandOf(db, userId, input.brandId)),
				),
			)
			.returning({ wishId: shopLink.wishId }),
	);
	if (!saved.ok) return listRefusal(saved.error, pictureIds);
	const [row] = saved.value;
	if (row) {
		const [held] = await readWishes(db, userId, row.wishId);
		if (held) return { ok: true, value: held };
	}
	const [link] = await db
		.select({ wishId: shopLink.wishId })
		.from(shopLink)
		.where(and(eq(shopLink.id, id), eq(shopLink.userId, userId)));
	if (!link) return { ok: false, error: { code: "not_found" } };
	if (input.brandId !== null) {
		const [ownBrand] = await brandOf(db, userId, input.brandId);
		if (!ownBrand)
			return {
				ok: false,
				error: { code: "invalid", field: "brandId", value: input.brandId },
			};
	}
	return { ok: false, error: { code: "conflict" } };
}

// Only the account's own link goes; not found when the account has no link
// with this id.
export async function deleteShopLink(
	db: Db,
	bucket: R2Bucket,
	userId: string,
	id: string,
): Promise<Result<ShopLinkId, WishError>> {
	const [row] = await deleteWithPictures(
		db,
		bucket,
		{ userId, owner: { shopLinkId: id } },
		db
			.delete(shopLink)
			.where(and(eq(shopLink.id, id), eq(shopLink.userId, userId)))
			.returning({ id: shopLink.id }),
	);
	return row
		? { ok: true, value: row.id as ShopLinkId }
		: { ok: false, error: { code: "not_found" } };
}
