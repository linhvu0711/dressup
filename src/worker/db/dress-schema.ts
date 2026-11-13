import {
	integer,
	primaryKey,
	sqliteTable,
	text,
} from "drizzle-orm/sqlite-core";
import { user } from "./auth-schema";

// The account's colour squares, one row per square. A row of a garment is
// read in `position` order; a new square takes a position below the
// smallest, so it sorts first.
export const colourSquare = sqliteTable(
	"colour_square",
	{
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		garment: text("garment").notNull(),
		hex: text("hex").notNull(),
		position: integer("position").notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.userId, table.garment, table.hex] }),
	],
);

export const outfit = sqliteTable("outfit", {
	userId: text("user_id")
		.primaryKey()
		.references(() => user.id, { onDelete: "cascade" }),
	modeId: text("mode_id").notNull(),
});

// What each garment of the outfit wears: its picked colour, and for a
// jacket whether it is open.
export const outfitGarment = sqliteTable(
	"outfit_garment",
	{
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		garment: text("garment").notNull(),
		hex: text("hex").notNull(),
		open: integer("open", { mode: "boolean" }).default(false).notNull(),
	},
	(table) => [primaryKey({ columns: [table.userId, table.garment] })],
);
