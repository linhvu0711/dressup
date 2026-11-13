import { and, desc, eq, sql } from "drizzle-orm";
import type { ModeId } from "@/dress/modes";
import type { Look, LookId, LookInput } from "@/looks/look";
import type { Db } from "./db";
import { look } from "./db/look-schema";

const toLook = (row: typeof look.$inferSelect): Look => ({
	id: row.id as LookId,
	modeId: row.modeId as ModeId,
	name: row.name,
	colours: row.colours,
	open: row.open,
});

export async function listLooks(db: Db, userId: string): Promise<Look[]> {
	const rows = await db
		.select()
		.from(look)
		.where(eq(look.userId, userId))
		// Two saves in one millisecond share created_at; rowid keeps their order.
		.orderBy(desc(look.createdAt), desc(sql`rowid`));
	return rows.map(toLook);
}

// The page makes the id when the save form opens, so a Save sent again after
// a lost answer writes over the same look rather than making a second one.
// An id another account holds is not touched: null.
export async function saveLook(
	db: Db,
	userId: string,
	input: LookInput,
): Promise<{ look: Look; created: boolean } | null> {
	const [before] = await db
		.select({ id: look.id })
		.from(look)
		.where(eq(look.id, input.id));
	const fields = {
		modeId: input.modeId,
		name: input.name,
		colours: input.colours,
		open: input.open,
	};
	const [row] = await db
		.insert(look)
		.values({ id: input.id, userId, ...fields })
		.onConflictDoUpdate({
			target: look.id,
			set: fields,
			setWhere: and(eq(look.id, input.id), eq(look.userId, userId)),
		})
		.returning();
	return row ? { look: toLook(row), created: !before } : null;
}
