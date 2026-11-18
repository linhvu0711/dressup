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
import { brand } from "./brand-schema";
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

// One shop that sells the piece of a wish: its address, with the shop's own
// brand, name, and price in VND, since each shop names and prices the same
// piece its own way. A removed wish takes its links; a deleted brand leaves
// its links with no brand. user_id is there so every read is scoped by the
// account and the account delete takes the links with it.
export const shopLink = sqliteTable(
	"shop_link",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		wishId: text("wish_id")
			.notNull()
			.references(() => wish.id, { onDelete: "cascade" }),
		url: text("url").notNull(),
		brandId: text("brand_id").references(() => brand.id, {
			onDelete: "set null",
		}),
		name: text("name").notNull(),
		price: integer("price"),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [
		index("shop_link_wishId_idx").on(table.wishId),
		index("shop_link_brandId_idx").on(table.brandId),
		index("shop_link_userId_idx").on(table.userId),
	],
);
