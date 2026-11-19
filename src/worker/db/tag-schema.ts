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
import { combination } from "./combination-schema";

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

// The tags on a combination. Every key cascades, so a tag delete takes the
// tag off each combination, and a combination delete takes its links.
export const combinationTag = sqliteTable(
	"combination_tag",
	{
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		combinationId: text("combination_id")
			.notNull()
			.references(() => combination.id, { onDelete: "cascade" }),
		tagId: text("tag_id")
			.notNull()
			.references(() => tag.id, { onDelete: "cascade" }),
	},
	(table) => [
		primaryKey({ columns: [table.combinationId, table.tagId] }),
		index("combination_tag_userId_idx").on(table.userId),
		// The tag list counts each tag's combinations by this key.
		index("combination_tag_tagId_idx").on(table.tagId),
	],
);
