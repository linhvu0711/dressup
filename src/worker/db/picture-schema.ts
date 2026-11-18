import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { user } from "./auth-schema";
import { ownedItem } from "./owned-item-schema";

// One picture: its object in the bucket has the picture's id as its key. A
// picture with no owner is a draft, uploaded in an open sheet and not saved
// yet. Every write goes through src/worker/picture-store.ts, which keeps the
// counters. The key to owned_item has no delete rule, so an item delete that
// skips the picture store fails rather than leave objects and a wrong count;
// #78 adds a shop link key beside it, with the same rule. created_at has no
// SQL default: the store writes it from JS, so a test can move the clock.
export const picture = sqliteTable(
	"picture",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		ownedItemId: text("owned_item_id").references(() => ownedItem.id),
		bytes: integer("bytes").notNull(),
		createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
	},
	(table) => [
		index("picture_userId_idx").on(table.userId),
		index("picture_ownedItemId_idx").on(table.ownedItemId),
	],
);
