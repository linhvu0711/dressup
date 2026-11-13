import { and, count, desc, eq, sql } from "drizzle-orm";
import type { ModeId } from "@/dress/modes";
import {
	LOOK_LIMIT,
	type Look,
	type LookId,
	type LookInput,
} from "@/looks/look";
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
// An id another account holds is not touched: conflict. A new id past the
// look limit is not saved: look_limit.
export async function saveLook(
	db: Db,
	userId: string,
	input: LookInput,
): Promise<
	| { ok: true; look: Look; created: boolean }
	| { ok: false; error: "conflict" | "look_limit" }
> {
	const [before] = await db
		.select({ id: look.id })
		.from(look)
		.where(eq(look.id, input.id));
	if (!before) {
		const [{ n }] = await db
			.select({ n: count() })
			.from(look)
			.where(eq(look.userId, userId));
		if (n >= LOOK_LIMIT) return { ok: false, error: "look_limit" };
	}
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
	return row
		? { ok: true, look: toLook(row), created: !before }
		: { ok: false, error: "conflict" };
}

// Only the account's own look goes; false when there is none to delete.
export async function deleteLook(
	db: Db,
	userId: string,
	id: string,
): Promise<boolean> {
	const rows = await db
		.delete(look)
		.where(and(eq(look.id, id), eq(look.userId, userId)))
		.returning({ id: look.id });
	return rows.length > 0;
}
