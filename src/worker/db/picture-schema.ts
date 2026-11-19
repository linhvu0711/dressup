import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { user } from "./auth-schema";
import { ownedItem } from "./owned-item-schema";
import { shopLink } from "./wish-schema";

// One picture: its object in the bucket has the picture's id as its key. A
// picture with no owner is a draft, uploaded in an open sheet and not saved
// yet. A saved picture has one owner, an owned item or a shop link, and the
// store keeps it so; every write goes through src/worker/picture-store.ts,
// which keeps the counters. Both owner keys have no delete rule, so an owner
// delete that skips the picture store fails rather than leave objects and a
// wrong count. created_at has no SQL default: the store writes it from JS, so
// a test can move the clock.
export const picture = sqliteTable(
	"picture",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		ownedItemId: text("owned_item_id").references(() => ownedItem.id),
		shopLinkId: text("shop_link_id").references(() => shopLink.id),
		bytes: integer("bytes").notNull(),
		createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
	},
	(table) => [
		index("picture_userId_idx").on(table.userId),
		index("picture_ownedItemId_idx").on(table.ownedItemId),
		index("picture_shopLinkId_idx").on(table.shopLinkId),
	],
);

// Uploads in one UTC month, as "2026-11", for all accounts: R2 bills each
// write past its free amount.
export const pictureUploadMonth = sqliteTable("picture_upload_month", {
	month: text("month").primaryKey(),
	count: integer("count").notNull(),
});

// One row, id 1: the bytes of every picture row. The upload raises it and
// every picture delete lowers it in the same batch, so the stop never sums
// every row.
export const pictureStorage = sqliteTable("picture_storage", {
	id: integer("id").primaryKey(),
	bytes: integer("bytes").notNull(),
});
