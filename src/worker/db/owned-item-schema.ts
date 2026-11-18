import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { GarmentId } from "../../react-app/dress/garments";
import { user } from "./auth-schema";
import { brand } from "./brand-schema";
import { colour } from "./colour-schema";

// One owned item: one brand of one piece, with a quantity. The key to colour
// has no delete rule, so a colour in use cannot go
// (docs/adr/0013-colour-belongs-to-the-account.md). A deleted brand leaves
// its items with no brand. No unique index on the piece and brand: two items
// of one piece that both lost their brand stay two items, so the store checks
// the duplicate rule in its write.
export const ownedItem = sqliteTable(
	"owned_item",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		typeId: text("type_id").$type<GarmentId>().notNull(),
		colourId: text("colour_id")
			.notNull()
			.references(() => colour.id),
		brandId: text("brand_id").references(() => brand.id, {
			onDelete: "set null",
		}),
		quantity: integer("quantity").notNull(),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [
		index("owned_item_userId_idx").on(table.userId),
		index("owned_item_colourId_idx").on(table.colourId),
		index("owned_item_brandId_idx").on(table.brandId),
	],
);
