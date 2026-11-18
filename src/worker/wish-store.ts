import { and, count, desc, eq, exists, notExists, sql } from "drizzle-orm";
import type { Hex } from "@/colour/hex";
import type { GarmentId } from "@/dress/garments";
import type { ColourId } from "@/labels/colour";
import {
	WISH_LIMIT,
	type Wish,
	type WishId,
	wishInputSchema,
} from "@/wishlist/wish";
import { colourOf } from "./colour-store";
import type { Db } from "./db";
import { user } from "./db/auth-schema";
import { colour } from "./db/colour-schema";
import { wish } from "./db/wish-schema";
import type { Result } from "./result";

export type WishField = "id" | "typeId" | "colourId" | "body";

export type WishError =
	| { code: "invalid"; field: WishField; value?: unknown }
	| { code: "duplicate"; id: WishId }
	| { code: "wish_limit" }
	| { code: "conflict" }
	| { code: "not_found" };

export type AddedWish = { wish: Wish; created: boolean };

type Piece = { typeId: GarmentId; colourId: string };

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
	return rows.map((row) => ({
		id: row.id as WishId,
		typeId: row.typeId,
		colour: {
			id: row.colourId as ColourId,
			name: row.colourName,
			hex: row.hex as Hex,
		},
		shopLinks: [],
	}));
}

export const listWishes = (db: Db, userId: string) => readWishes(db, userId);

const isField = (key: unknown): key is WishField =>
	key === "id" || key === "typeId" || key === "colourId";

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
	userId: string,
	id: string,
): Promise<Result<WishId, WishError>> {
	const [row] = await db
		.delete(wish)
		.where(and(eq(wish.id, id), eq(wish.userId, userId)))
		.returning({ id: wish.id });
	return row
		? { ok: true, value: row.id as WishId }
		: { ok: false, error: { code: "not_found" } };
}
