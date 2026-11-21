import { and, eq } from "drizzle-orm";
import type { TypeId } from "@/dress/clothing-types";
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
