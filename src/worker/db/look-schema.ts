import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { GarmentId, Hex, JacketId } from "../../react-app/dress/garments";
import { user } from "./auth-schema";

// A saved look, one row each. Its colours and open jackets are its own
// copy, read and written whole, so they sit in the row as JSON.
export const look = sqliteTable(
	"look",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		modeId: text("mode_id").notNull(),
		name: text("name").notNull(),
		colours: text("colours", { mode: "json" })
			.$type<Partial<Record<GarmentId, Hex>>>()
			.notNull(),
		open: text("open", { mode: "json" }).$type<JacketId[]>().notNull(),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [index("look_userId_idx").on(table.userId)],
);
