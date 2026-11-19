import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { user } from "./auth-schema";

// The account's skin and hair colour. The row is written on the first
// change; an account with no row has the starter colours.
export const mannequin = sqliteTable("mannequin", {
	userId: text("user_id")
		.primaryKey()
		.references(() => user.id, { onDelete: "cascade" }),
	skin: text("skin").notNull(),
	hair: text("hair").notNull(),
});
