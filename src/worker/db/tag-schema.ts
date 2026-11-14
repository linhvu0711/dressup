import { sql } from "drizzle-orm";
import {
	index,
	integer,
	primaryKey,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { user } from "./auth-schema";
import { look } from "./look-schema";

// The account's tags. The page checks names in any letter case; the index
// folds only A to Z, so it keeps two tabs from storing "Work" twice.
export const tag = sqliteTable(
	"tag",
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
		uniqueIndex("tag_userId_name_uq").on(
			table.userId,
			sql`lower(${table.name})`,
		),
	],
);

// Which tags each look has. A look keeps tag ids, so a rename is one row.
export const lookTag = sqliteTable(
	"look_tag",
	{
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		lookId: text("look_id")
			.notNull()
			.references(() => look.id, { onDelete: "cascade" }),
		tagId: text("tag_id")
			.notNull()
			.references(() => tag.id, { onDelete: "cascade" }),
	},
	(table) => [
		primaryKey({ columns: [table.lookId, table.tagId] }),
		index("look_tag_userId_idx").on(table.userId),
	],
);
