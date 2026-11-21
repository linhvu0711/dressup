import {
	and,
	asc,
	desc,
	eq,
	exists,
	notExists,
	type SQL,
	sql,
} from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { z } from "zod";
import type { Hex } from "@/colour/hex";
import type { PieceRef } from "@/combinations/marks";
import type { TypeId } from "@/dress/clothing-types";
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
	wishlistAddSchema,
} from "@/wishlist/wish";
import { brandOf, brandOrNone, notYourBrand } from "./brand-store";
import { colourOf } from "./colour-store";
import type { Db } from "./db";
import { brand } from "./db/brand-schema";
import { colour } from "./db/colour-schema";
import { shopLink, wish } from "./db/wish-schema";
import { guardedAdd, insertUnder } from "./guarded-add";
import { deleteOwner, pictureIdsBy, saveWithPictures } from "./picture-store";
import { pieceRefusal, samePiece } from "./piece-rows";
import { invalidField, type Result } from "./result";

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

type Statement = BatchItem<"sqlite">;

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
	const pictures = await pictureIdsBy(db, userId, { kind: "wish", id: wishId });
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
			brand: brandOrNone(row.brandId, row.brandName),
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

const WISH_FIELDS: readonly WishField[] = [
	"id",
	"typeId",
	"colourId",
	"url",
	"brandId",
	"name",
	"price",
	"pictureIds",
];

type Piece = { id: string; typeId: TypeId; colourId: string };

// A new wish needs the account's colour and no wish for its piece yet.
const wishGuards = (db: Db, userId: string, piece: Piece) => [
	exists(colourOf(db, userId, piece.colourId)),
	notExists(
		db
			.select({ one: sql`1` })
			.from(wish)
			.where(samePiece(wish, userId, piece)),
	),
];

// The page makes the id when the form opens, so an add sent again after a
// lost answer gives back the same wish rather than a second one; the same id
// with another piece, or another account's id, is conflict. The colour, the
// limit, and the duplicate rule are the shared add's guards, so two adds at
// once cannot both pass them; the unique index turns a lost race on one piece
// into no row too.
export async function addWish(
	db: Db,
	userId: string,
	draft: unknown,
): Promise<Result<AddedWish, WishError>> {
	const parsed = wishInputSchema.safeParse(draft);
	if (!parsed.success)
		return invalidField(WISH_FIELDS, draft, parsed.error.issues[0]?.path ?? []);
	const input = parsed.data;
	const added = await guardedAdd(db, {
		table: wish,
		userId,
		id: input.id,
		mine: samePiece(wish, userId, input),
		values: { typeId: input.typeId, colourId: input.colourId },
		guards: wishGuards(db, userId, input),
		limit: { max: WISH_LIMIT, code: "wish_limit" },
		read: async () => (await readWishes(db, userId, input.id))[0],
		refused: (): Promise<WishError | null> =>
			pieceRefusal(
				db,
				userId,
				{ table: wish, where: samePiece(wish, userId, input) },
				input,
			),
	});
	return added.ok
		? {
				ok: true,
				value: { wish: added.value.value, created: added.value.created },
			}
		: added;
}

// One add from the Wishlist form: the piece, with its first shop link when
// the user gave an address, the whole of it in one request.
export async function addToWishlist(
	db: Db,
	bucket: R2Bucket,
	userId: string,
	draft: unknown,
): Promise<Result<AddedWish, WishError>> {
	const parsed = wishlistAddSchema.safeParse(draft);
	if (!parsed.success) {
		const path = parsed.error.issues[0]?.path ?? [];
		// A link field is named as the add-a-link route names it.
		return path[0] === "shopLink"
			? invalidField(
					WISH_FIELDS,
					(draft as { shopLink?: unknown }).shopLink,
					path.slice(1),
				)
			: invalidField(WISH_FIELDS, draft, path);
	}
	const { shopLink: link, ...piece } = parsed.data;
	return link
		? addWishWithLink(db, bucket, userId, piece, link)
		: addWish(db, userId, piece);
}

// Only the account's own wish goes; not found when the account has no wish
// with this id.
export async function deleteWish(
	db: Db,
	bucket: R2Bucket,
	userId: string,
	id: string,
): Promise<Result<WishId, WishError>> {
	const deleted = await deleteOwner(db, bucket, userId, { kind: "wish", id });
	return deleted.ok ? { ok: true, value: deleted.value as WishId } : deleted;
}

type AddedShopLink = AddedWish;

// The same replay rule as a wish: the same id on the same wish gives back
// the wish; the same id anywhere else is conflict. The wish, the brand, and
// the limit are the shared add's guards, so two adds at once cannot both pass
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
		return invalidField(WISH_FIELDS, draft, parsed.error.issues[0]?.path ?? []);
	const input = parsed.data;
	return addLinkUnder(db, bucket, userId, {
		wishId,
		parent: and(eq(wish.id, wishId), eq(wish.userId, userId)),
		link: input,
		refused: () => refusedLink(db, userId, wishId, input),
	});
}

type LinkInput = z.output<typeof shopLinkInputSchema>;

// A shop link under the wish `wishId`, the row `parent` finds. A parent
// write, the new wish itself, runs first in the link's batch.
async function addLinkUnder(
	db: Db,
	bucket: R2Bucket,
	userId: string,
	{
		wishId,
		parent,
		link,
		parentWrite,
		refused,
	}: {
		wishId: string;
		parent: SQL | undefined;
		link: LinkInput;
		parentWrite?: Statement;
		refused: () => Promise<WishError | null>;
	},
): Promise<Result<AddedShopLink, WishError>> {
	const writeId = crypto.randomUUID();
	const added = await guardedAdd(db, {
		table: shopLink,
		userId,
		id: link.id,
		mine: and(eq(shopLink.userId, userId), eq(shopLink.wishId, wishId)),
		parent: { table: wish, where: parent },
		values: {
			wishId,
			url: link.url,
			brandId: link.brandId,
			name: link.name,
			price: link.price,
			writeId,
		},
		guards: [brandGuard(db, userId, link.brandId)],
		limit: {
			max: SHOP_LINK_LIMIT,
			code: "shop_link_limit",
			of: eq(shopLink.wishId, wishId),
		},
		// Only this send's own insert takes the pictures, so a conflict, a
		// refused insert, or a send of the same add that landed first attaches
		// and drops none.
		write: (insert) =>
			saveWithPictures(
				db,
				bucket,
				{
					userId,
					owner: {
						kind: "shopLink",
						id: link.id,
						holds: { wishId, writeId },
					},
					ids: link.pictureIds,
				},
				insert,
				parentWrite,
			),
		read: async () => (await readWishes(db, userId, wishId))[0],
		refused,
	});
	return added.ok
		? {
				ok: true,
				value: { wish: added.value.value, created: added.value.created },
			}
		: added;
}

const brandGuard = (db: Db, userId: string, brandId: string | null) =>
	brandId === null ? undefined : exists(brandOf(db, userId, brandId));

// A new wish with its first shop link, in one batch. The wish insert holds
// the link's checks too, so a refused link leaves no wish.
async function addWishWithLink(
	db: Db,
	bucket: R2Bucket,
	userId: string,
	piece: Piece,
	link: LinkInput,
): Promise<Result<AddedShopLink, WishError>> {
	const wishInsert = insertUnder(db, wish, {
		userId,
		id: piece.id,
		values: { typeId: piece.typeId, colourId: piece.colourId },
		guards: [
			...wishGuards(db, userId, piece),
			brandGuard(db, userId, link.brandId),
			notExists(
				db
					.select({ one: sql`1` })
					.from(shopLink)
					.where(eq(shopLink.id, link.id)),
			),
		],
		limit: { max: WISH_LIMIT },
	}).onConflictDoNothing();
	return addLinkUnder(db, bucket, userId, {
		wishId: piece.id,
		parent: and(eq(wish.id, piece.id), samePiece(wish, userId, piece)),
		link,
		parentWrite: wishInsert,
		refused: async () => {
			const why = await pieceRefusal<WishId>(
				db,
				userId,
				{ table: wish, where: samePiece(wish, userId, piece) },
				{ colourId: piece.colourId, brandId: link.brandId },
			);
			if (why) return why;
			// The id is another piece's or another account's wish, as addWish
			// answers; else only the wish cap is left, since a new wish holds no
			// link.
			const [taken] = await db
				.select({ id: wish.id })
				.from(wish)
				.where(eq(wish.id, piece.id));
			return taken ? { code: "conflict" } : { code: "wish_limit" };
		},
	});
}

// Why a shop link add that the guards stopped did not happen, in the order
// a person would fix it.
async function refusedLink(
	db: Db,
	userId: string,
	wishId: string,
	input: { brandId: string | null },
): Promise<WishError | null> {
	const [ownWish] = await db
		.select({ id: wish.id })
		.from(wish)
		.where(and(eq(wish.id, wishId), eq(wish.userId, userId)));
	if (!ownWish) return { code: "not_found" };
	return notYourBrand(db, userId, input.brandId);
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
		return invalidField(WISH_FIELDS, draft, parsed.error.issues[0]?.path ?? []);
	const { pictureIds, ...input } = parsed.data;
	const saved = await saveWithPictures(
		db,
		bucket,
		{
			userId,
			// The link holds the new brand only when the update wrote, since it
			// runs first in the batch; a refused change attaches and drops nothing.
			owner: { kind: "shopLink", id, holds: { brandId: input.brandId } },
			ids: pictureIds,
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
	if (!saved.ok) return saved;
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
	return {
		ok: false,
		error: (await notYourBrand(db, userId, input.brandId)) ?? {
			code: "conflict",
		},
	};
}

// Only the account's own link goes; not found when the account has no link
// with this id.
export async function deleteShopLink(
	db: Db,
	bucket: R2Bucket,
	userId: string,
	id: string,
): Promise<Result<ShopLinkId, WishError>> {
	const deleted = await deleteOwner(db, bucket, userId, {
		kind: "shopLink",
		id,
	});
	return deleted.ok
		? { ok: true, value: deleted.value as ShopLinkId }
		: deleted;
}
