import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { user } from "./auth-schema";

// One row per account: the count of AI actions in the current clock minute.
// A call in a new minute starts the count again.
export const aiActionCount = sqliteTable("ai_action_count", {
	userId: text("user_id")
		.primaryKey()
		.references(() => user.id, { onDelete: "cascade" }),
	minute: integer("minute").notNull(),
	count: integer("count").notNull(),
});
