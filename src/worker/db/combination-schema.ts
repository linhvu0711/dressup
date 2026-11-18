import { sql } from "drizzle-orm";
import {
	index,
	integer,
	primaryKey,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";
import type { GarmentId, Layer } from "../../react-app/dress/garments";
import { user } from "./auth-schema";
import { colour } from "./colour-schema";

// A saved combination. key is its pieces and jacket state as text, so the
// index refuses a second combination with the same identity, even from two
// saves at once.
export const combination = sqliteTable(
	"combination",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		key: text("key").notNull(),
		open: integer("open", { mode: "boolean" }).notNull(),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [
		uniqueIndex("combination_userId_key_uq").on(table.userId, table.key),
	],
);

// One row for each piece, one piece for each layer. A piece points at the
// account's colour, so a colour change shows on every combination; the key
// to colour has no delete rule, so a colour in use cannot go
// (docs/adr/0013-colour-belongs-to-the-account.md).
export const combinationPiece = sqliteTable(
	"combination_piece",
	{
		combinationId: text("combination_id")
			.notNull()
			.references(() => combination.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		layer: text("layer").$type<Layer>().notNull(),
		typeId: text("type_id").$type<GarmentId>().notNull(),
		colourId: text("colour_id")
			.notNull()
			.references(() => colour.id),
	},
	(table) => [
		primaryKey({ columns: [table.combinationId, table.layer] }),
		index("combination_piece_colourId_idx").on(table.colourId),
	],
);
