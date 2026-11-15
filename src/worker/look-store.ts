import {
	and,
	asc,
	count,
	desc,
	eq,
	exists,
	inArray,
	or,
	sql,
} from "drizzle-orm";
import type { GarmentId, Hex, JacketId } from "@/dress/garments";
import type { ModeId } from "@/dress/modes";
import {
	LOOK_LIMIT,
	type Look,
	type LookId,
	type LookInput,
} from "@/looks/look";
import type { TagId } from "@/tags/tag";
import type { Db } from "./db";
import { user } from "./db/auth-schema";
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
// account's: an id from another account writes no row. With a mode, only
// while the look still has that mode, so a refused change writes no tag.
const tagWrites = (
	db: Db,
	userId: string,
	lookId: string,
	tagIds: TagId[],
	modeId?: ModeId,
) => {
	const theLook = and(
		eq(look.id, lookId),
		eq(look.userId, userId),
		modeId === undefined ? undefined : eq(look.modeId, modeId),
	);
	const lookIsThere = exists(
		db.select({ one: sql`1` }).from(look).where(theLook),
	);
	const clear = db
		.delete(lookTag)
		.where(
			and(eq(lookTag.lookId, lookId), eq(lookTag.userId, userId), lookIsThere),
		);
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
					lookIsThere,
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
// look limit is not saved: look_limit. The count sits in the insert, so two
// saves at once cannot both pass it.
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
	const fields = {
		modeId: input.modeId,
		name: input.name,
		colours: input.colours,
		open: input.open,
	};
	const [rows, ...rest] = await db.batch([
		db
			.insert(look)
			.select(
				db
					.select({
						id: sql<string>`${input.id}`.as("id"),
						userId: user.id,
						modeId: sql<string>`${input.modeId}`.as("mode_id"),
						name: sql<string>`${input.name}`.as("name"),
						colours: sql<string>`${JSON.stringify(input.colours)}`.as(
							"colours",
						),
						open: sql<string>`${JSON.stringify(input.open)}`.as("open"),
						createdAt:
							sql<number>`(cast(unixepoch('subsecond') * 1000 as integer))`.as(
								"created_at",
							),
					})
					.from(user)
					.where(
						and(
							eq(user.id, userId),
							or(
								sql`(${db
									.select({ n: count() })
									.from(look)
									.where(eq(look.userId, userId))}) < ${LOOK_LIMIT}`,
								exists(
									db
										.select({ one: sql`1` })
										.from(look)
										.where(eq(look.id, input.id)),
								),
							),
						),
					),
			)
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
	if (row)
		return {
			ok: true,
			look: toLook(row, rest.at(-1) as Link[]),
			created: !before,
		};
	return { ok: false, error: before ? "conflict" : "look_limit" };
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

export type LookPatch = {
	name?: string;
	colours?: Partial<Record<GarmentId, Hex>>;
	open?: JacketId[];
	tags?: TagId[];
};

// Writes only the fields given, so two changes made from one read keep each
// other's fields. Colours and open jackets are written only while the look
// still has the mode they were checked against: "moved" when the page
// changed it since. null when the look is gone.
export async function changeLook(
	db: Db,
	userId: string,
	id: string,
	patch: LookPatch,
	modeId: ModeId,
): Promise<Look | null | "moved"> {
	const guardMode = patch.colours !== undefined || patch.open !== undefined;
	const [rows, ...rest] = await db.batch([
		db
			.update(look)
			.set({
				// Always one column, so a tags-only change still returns the row.
				id: sql`${look.id}`,
				...(patch.name !== undefined && { name: patch.name }),
				...(patch.open !== undefined && { open: patch.open }),
				...(patch.colours !== undefined && {
					colours: sql`json_patch(${look.colours}, ${JSON.stringify(patch.colours)})`,
				}),
			})
			.where(
				and(
					eq(look.id, id),
					eq(look.userId, userId),
					guardMode ? eq(look.modeId, modeId) : undefined,
				),
			)
			.returning(),
		...(patch.tags === undefined
			? []
			: tagWrites(db, userId, id, patch.tags, guardMode ? modeId : undefined)),
		tagLinks(db, userId, id),
	]);
	const [row] = rows;
	if (row) return toLook(row, rest.at(-1) as Link[]);
	const [still] = await db
		.select({ id: look.id })
		.from(look)
		.where(and(eq(look.id, id), eq(look.userId, userId)));
	return still ? "moved" : null;
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
