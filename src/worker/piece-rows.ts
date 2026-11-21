import { and, eq, type SQL } from "drizzle-orm";
import type { TypeId } from "@/dress/clothing-types";
import { notYourBrand } from "./brand-store";
import { colourOf } from "./colour-store";
import type { Db } from "./db";
import type { ownedItem } from "./db/owned-item-schema";
import type { wish } from "./db/wish-schema";

type PieceTable = typeof ownedItem | typeof wish;

type Piece = { typeId: TypeId; colourId: string };

// The account's rows of one piece: one type in one colour.
export const samePiece = (table: PieceTable, userId: string, piece: Piece) =>
	and(
		eq(table.userId, userId),
		eq(table.typeId, piece.typeId),
		eq(table.colourId, piece.colourId),
	);

export type PieceRefusal<Id extends string> =
	| { code: "invalid"; field: "colourId" | "brandId"; value: string }
	| { code: "duplicate"; id: Id };

// Why a write of a piece that the guards stopped did not happen, in the
// order a person would fix it: the colour, the brand, then the row that
// holds the piece. `otherThan` is the row a change writes, which holds its
// own piece.
export async function pieceRefusal<Id extends string>(
	db: Db,
	userId: string,
	holders: { table: PieceTable; where: SQL | undefined },
	piece: { colourId: string; brandId?: string | null },
	otherThan?: string,
): Promise<PieceRefusal<Id> | null> {
	const [ownColour] = await colourOf(db, userId, piece.colourId);
	if (!ownColour)
		return { code: "invalid", field: "colourId", value: piece.colourId };
	if (piece.brandId !== undefined) {
		const notYours = await notYourBrand(db, userId, piece.brandId);
		if (notYours) return notYours;
	}
	const rows = await db
		.select({ id: holders.table.id })
		.from(holders.table)
		.where(holders.where);
	const held = rows.find((row) => row.id !== otherThan);
	return held ? { code: "duplicate", id: held.id as Id } : null;
}
