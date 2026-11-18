import { sql } from "drizzle-orm";
import {
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { user } from "./auth-schema";

// The account's brands. The page checks names in any letter case; the index
// folds only A to Z, so it keeps two tabs from storing "Zara" twice.
export const brand = sqliteTable(
	"brand",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [
		uniqueIndex("brand_userId_name_uq").on(
			table.userId,
			sql`lower(${table.name})`,
		),
	],
);
