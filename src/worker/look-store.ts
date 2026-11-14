import { and, asc, count, desc, eq, exists, inArray, sql } from "drizzle-orm";
import type { ModeId } from "@/dress/modes";
import {
	LOOK_LIMIT,
	type Look,
	type LookId,
	type LookInput,
} from "@/looks/look";
import type { TagId } from "@/tags/tag";
import type { Db } from "./db";
import { look } from "./db/look-schema";
import { lookTag, tag } from "./db/tag-schema";

type Link = { lookId: string; tagId: string };

const toLook = (row: typeof look.$inferSelect, links: Link[]): Look => ({
	id: row.id as LookId,
	modeId: row.modeId as ModeId,
	name: row.name,
	colours: row.colours,
	open: row.open,
	tags: links.filter((l) => l.lookId === row.id).map((l) => l.tagId as TagId),
});

// A look's tags come in the order the tags were made, as the tag list has
// them.
const tagLinks = (db: Db, userId: string, lookId?: string) =>
	db
		.select({ lookId: lookTag.lookId, tagId: lookTag.tagId })
		.from(lookTag)
		.innerJoin(tag, eq(tag.id, lookTag.tagId))
		.where(
			lookId
				? and(eq(lookTag.userId, userId), eq(lookTag.lookId, lookId))
				: eq(lookTag.userId, userId),
		)
		.orderBy(asc(tag.createdAt), asc(sql`${tag}.rowid`));

// Only the account's own tags go on the look, and only when the look is the
// account's: an id from another account writes no row.
const tagWrites = (db: Db, userId: string, lookId: string, tagIds: TagId[]) => {
	const clear = db
		.delete(lookTag)
		.where(and(eq(lookTag.lookId, lookId), eq(lookTag.userId, userId)));
	if (tagIds.length === 0) return [clear];
	const insert = db.insert(lookTag).select(
		db
			.select({
				userId: tag.userId,
				lookId: sql<string>`${lookId}`.as("look_id"),
				tagId: tag.id,
			})
			.from(tag)
			.where(
				and(
					eq(tag.userId, userId),
					inArray(tag.id, [...new Set(tagIds)]),
					exists(
						db
							.select({ one: sql`1` })
							.from(look)
							.where(and(eq(look.id, lookId), eq(look.userId, userId))),
					),
				),
			),
	);
	return [clear, insert];
};

export async function listLooks(db: Db, userId: string): Promise<Look[]> {
	const [rows, links] = await db.batch([
		db
			.select()
			.from(look)
			.where(eq(look.userId, userId))
			// Two saves in one millisecond share created_at; rowid keeps their order.
			.orderBy(desc(look.createdAt), desc(sql`rowid`)),
		tagLinks(db, userId),
	]);
	return rows.map((row) => toLook(row, links));
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
	const [rows, ...rest] = await db.batch([
		db
			.insert(look)
			.values({ id: input.id, userId, ...fields })
			.onConflictDoUpdate({
				target: look.id,
				set: fields,
				setWhere: and(eq(look.id, input.id), eq(look.userId, userId)),
			})
			.returning(),
		...tagWrites(db, userId, input.id, input.tags),
		tagLinks(db, userId, input.id),
	]);
	const [row] = rows;
	return row
		? { ok: true, look: toLook(row, rest.at(-1) as Link[]), created: !before }
		: { ok: false, error: "conflict" };
}

// Changes only a look the account has; a gone id is not made again, as
// saveLook would: null. createdAt stays, so the look keeps its place.
export async function updateLook(
	db: Db,
	userId: string,
	input: LookInput,
): Promise<Look | null> {
	const [rows, ...rest] = await db.batch([
		db
			.update(look)
			.set({
				modeId: input.modeId,
				name: input.name,
				colours: input.colours,
				open: input.open,
			})
			.where(and(eq(look.id, input.id), eq(look.userId, userId)))
			.returning(),
		...tagWrites(db, userId, input.id, input.tags),
		tagLinks(db, userId, input.id),
	]);
	const [row] = rows;
	return row ? toLook(row, rest.at(-1) as Link[]) : null;
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
