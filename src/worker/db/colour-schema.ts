import { sql } from "drizzle-orm";
import {
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { user } from "./auth-schema";

// The account's colours. The page checks names in any letter case; the index
// folds only A to Z, so it keeps two tabs from storing "Navy" twice.
export const colour = sqliteTable(
	"colour",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		hex: text("hex").notNull(),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [
		uniqueIndex("colour_userId_name_uq").on(
			table.userId,
			sql`lower(${table.name})`,
		),
	],
);

// One row for each account that got the starter colours, so a list the user
// emptied stays empty and is not seeded again.
export const colourSeed = sqliteTable("colour_seed", {
	userId: text("user_id")
		.primaryKey()
		.references(() => user.id, { onDelete: "cascade" }),
	createdAt: integer("created_at", { mode: "timestamp_ms" })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.notNull(),
});
