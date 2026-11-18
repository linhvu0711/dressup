import { sql } from "drizzle-orm";
import {
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";
import type { GarmentId } from "../../react-app/dress/garments";
import { user } from "./auth-schema";
import { colour } from "./colour-schema";

// One wish: one piece the account wants to buy. The key to colour has no
// delete rule, so a colour in use cannot go
// (docs/adr/0013-colour-belongs-to-the-account.md). A piece holds one wish,
// and every column of that key is not null, so a unique index keeps it.
export const wish = sqliteTable(
	"wish",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		typeId: text("type_id").$type<GarmentId>().notNull(),
		colourId: text("colour_id")
			.notNull()
			.references(() => colour.id),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [
		uniqueIndex("wish_userId_typeId_colourId_uq").on(
			table.userId,
			table.typeId,
			table.colourId,
		),
		index("wish_colourId_idx").on(table.colourId),
	],
);
