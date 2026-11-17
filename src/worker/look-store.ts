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
import type { GarmentId } from "@/dress/garments";
import type { ModeId } from "@/dress/modes";
import {
	checkLook,
	LOOK_LIMIT,
	type Look,
	type LookId,
	type LookProblem,
} from "@/looks/look";
import type { TagId } from "@/tags/tag";
import type { Db } from "./db";
import { user } from "./db/auth-schema";
import { look } from "./db/look-schema";
import { lookTag, tag } from "./db/tag-schema";
import type { Result } from "./result";

// A look as a website or an AI app sends it, before the look rules ran.
export type LookDraft = {
	id: string;
	modeId: string;
	name: string;
	colours: Record<string, string>;
	open: string[];
	tags: string[];
};

export type LookError =
	| LookProblem
	| { code: "conflict" }
	| { code: "look_limit" }
	| { code: "not_found" }
	| { code: "moved" };

export type SavedLook = { look: Look; created: boolean; tagsLeftOff: string[] };

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
// account's; the action lists every other id in tagsLeftOff. With a mode,
// only while the look still has that mode, so a refused change writes no tag.
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

// The ids sent, once each and in the order sent, that did not go on the look.
const leftOff = (sent: string[], kept: TagId[]): string[] =>
	[...new Set(sent)].filter((id) => !(kept as string[]).includes(id));

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
	draft: LookDraft,
): Promise<Result<SavedLook, LookError>> {
	const checked = checkLook(draft);
	if (!checked.ok) return { ok: false, error: checked.problem };
	const input = checked.look;
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
	if (!row)
		return { ok: false, error: { code: before ? "conflict" : "look_limit" } };
	const saved = toLook(row, rest.at(-1) as Link[]);
	return {
		ok: true,
		value: {
			look: saved,
			created: !before,
			tagsLeftOff: leftOff(draft.tags, saved.tags),
		},
	};
}

export type LookPatch = Partial<Omit<LookDraft, "id">>;

export type ChangedLook = { look: Look; tagsLeftOff: string[] };

// Finds the look by id, checks the whole look, and writes only the fields
// given, so two changes made from one read keep each other's fields. A gone
// id is not made again, as saveLook would; createdAt stays, so the look keeps
// its place. A patch with a mode replaces the colours whole. Colours and open
// jackets without a mode are written only while the look still has the mode
// they were checked against: "moved" when the page changed it since.
export async function changeLook(
	db: Db,
	userId: string,
	id: string,
	patch: LookPatch,
): Promise<Result<ChangedLook, LookError>> {
	const [rows, links] = await db.batch([
		db
			.select()
			.from(look)
			.where(and(eq(look.id, id), eq(look.userId, userId))),
		tagLinks(db, userId, id),
	]);
	const [storedRow] = rows;
	if (!storedRow) return { ok: false, error: { code: "not_found" } };
	const stored = toLook(storedRow, links);
	const newMode = patch.modeId !== undefined;
	const checked = checkLook({
		id: stored.id,
		modeId: patch.modeId ?? stored.modeId,
		name: patch.name ?? stored.name,
		colours: newMode
			? (patch.colours ?? {})
			: { ...stored.colours, ...patch.colours },
		open: patch.open ?? stored.open,
		tags: patch.tags ?? stored.tags,
	});
	if (!checked.ok) return { ok: false, error: checked.problem };
	const whole = checked.look;
	const guardMode =
		!newMode && (patch.colours !== undefined || patch.open !== undefined);
	// Only the garments sent, so a colour the page saved since the read stays.
	const sentColours =
		patch.colours &&
		Object.fromEntries(
			Object.keys(patch.colours).map((g) => [g, whole.colours[g as GarmentId]]),
		);
	const [written, ...rest] = await db.batch([
		db
			.update(look)
			.set({
				// Always one column, so a tags-only change still returns the row.
				id: sql`${look.id}`,
				...(newMode && { modeId: whole.modeId, colours: whole.colours }),
				...(patch.name !== undefined && { name: whole.name }),
				...(patch.open !== undefined && { open: whole.open }),
				...(!newMode &&
					sentColours && {
						colours: sql`json_patch(${look.colours}, ${JSON.stringify(sentColours)})`,
					}),
			})
			.where(
				and(
					eq(look.id, id),
					eq(look.userId, userId),
					guardMode ? eq(look.modeId, stored.modeId) : undefined,
				),
			)
			.returning(),
		...(patch.tags === undefined
			? []
			: tagWrites(
					db,
					userId,
					id,
					whole.tags,
					guardMode ? stored.modeId : undefined,
				)),
		tagLinks(db, userId, id),
	]);
	const [row] = written;
	if (row) {
		const changed = toLook(row, rest.at(-1) as Link[]);
		return {
			ok: true,
			value: {
				look: changed,
				tagsLeftOff:
					patch.tags === undefined ? [] : leftOff(patch.tags, changed.tags),
			},
		};
	}
	const [still] = await db
		.select({ id: look.id })
		.from(look)
		.where(and(eq(look.id, id), eq(look.userId, userId)));
	return { ok: false, error: { code: still ? "moved" : "not_found" } };
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
