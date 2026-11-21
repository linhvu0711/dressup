import {
	and,
	asc,
	count,
	desc,
	eq,
	exists,
	inArray,
	type SQL,
	sql,
} from "drizzle-orm";
import type { Hex } from "@/colour/hex";
import {
	COMBINATION_LIMIT,
	type Combination,
	type CombinationId,
	type CombinationInput,
	type CombinationProblem,
	checkCombination,
	combinationKey,
} from "@/combinations/combination";
import {
	checkPieceRows,
	filterCombinations,
	type OwnChoice,
} from "@/combinations/filter";
import { LAYER_OF, LAYERS } from "@/dress/clothing-types";
import type { ColourId } from "@/labels/colour";
import type { TagId } from "@/tags/tag";
import { listColours } from "./colour-store";
import type { Db } from "./db";
import { user } from "./db/auth-schema";
import { colour } from "./db/colour-schema";
import { combination, combinationPiece } from "./db/combination-schema";
import { combinationTag, tag } from "./db/tag-schema";
import type { Result } from "./result";
import { listTags } from "./tag-store";

// A combination as a website or an AI app sends it, before the rules ran.
type CombinationDraft = {
	id: string;
	pieces: { typeId: string; colourId: string }[];
	tags?: string[];
};

// A change to a saved combination: its pieces, whole. The id comes from the
// address or the tool call; tags left out keep the stored tags.
type CombinationChange = {
	pieces: { typeId: string; colourId: string }[];
	tags?: string[];
};

export type CombinationError =
	| CombinationProblem
	| { code: "conflict" }
	| { code: "duplicate"; id: CombinationId }
	| { code: "combination_limit" }
	| { code: "not_found" };

type SavedCombination = { combination: Combination; created: boolean };

// The account's combinations, newest first, or the one with this id.
async function readCombinations(
	db: Db,
	userId: string,
	id?: string,
): Promise<Combination[]> {
	const [rows, pieces, tags] = await db.batch([
		db
			.select({ id: combination.id })
			.from(combination)
			.where(
				and(
					eq(combination.userId, userId),
					id === undefined ? undefined : eq(combination.id, id),
				),
			)
			// Two saves in one millisecond share created_at; rowid keeps their order.
			.orderBy(desc(combination.createdAt), desc(sql`${combination}.rowid`)),
		db
			.select({
				combinationId: combinationPiece.combinationId,
				layer: combinationPiece.layer,
				typeId: combinationPiece.typeId,
				colourId: colour.id,
				name: colour.name,
				hex: colour.hex,
			})
			.from(combinationPiece)
			.innerJoin(colour, eq(colour.id, combinationPiece.colourId))
			.where(
				and(
					eq(combinationPiece.userId, userId),
					id === undefined ? undefined : eq(combinationPiece.combinationId, id),
				),
			)
			.orderBy(asc(combinationPiece.combinationId)),
		// In the order the tags were made, as the tag list has them, whatever
		// order a save sent them in.
		db
			.select({
				combinationId: combinationTag.combinationId,
				tagId: combinationTag.tagId,
			})
			.from(combinationTag)
			.innerJoin(tag, eq(tag.id, combinationTag.tagId))
			.where(
				and(
					eq(combinationTag.userId, userId),
					id === undefined ? undefined : eq(combinationTag.combinationId, id),
				),
			)
			.orderBy(asc(tag.createdAt), asc(sql`${tag}.rowid`)),
	]);
	return rows.map((row) => ({
		id: row.id as CombinationId,
		pieces: pieces
			.filter((p) => p.combinationId === row.id)
			.sort((a, b) => LAYERS.indexOf(a.layer) - LAYERS.indexOf(b.layer))
			.map((p) => ({
				layer: p.layer,
				typeId: p.typeId,
				colour: { id: p.colourId as ColourId, name: p.name, hex: p.hex as Hex },
			})),
		tags: tags
			.filter((t) => t.combinationId === row.id)
			.map((t) => t.tagId as TagId),
	}));
}

// The combinations that match every piece row, carry every tag, and pass
// Pieces I own, newest first. A type, colour, or tag the account does not
// have is refused, as a save refuses it.
export async function findCombinations(
	db: Db,
	userId: string,
	filter: {
		pieces: { typeId?: string; colourId?: string }[];
		tags: string[];
		own: OwnChoice;
	},
	owned: ReadonlySet<string>,
): Promise<Result<Combination[], CombinationProblem>> {
	const checked = checkPieceRows(filter.pieces);
	if (!checked.ok) return { ok: false, error: checked.problem };
	const notColour = await notYourColour(db, userId, filter.pieces);
	if (notColour) return { ok: false, error: notColour };
	const notTag = await notYourTag(db, userId, filter.tags);
	if (notTag) return { ok: false, error: notTag };
	return {
		ok: true,
		value: filterCombinations(
			await readCombinations(db, userId),
			{ pieces: checked.rows, tags: filter.tags as TagId[], own: filter.own },
			owned,
		),
	};
}

const keyHolder = async (db: Db, userId: string, key: string) => {
	const [row] = await db
		.select({ id: combination.id })
		.from(combination)
		.where(and(eq(combination.userId, userId), eq(combination.key, key)));
	return row?.id as CombinationId | undefined;
};

// Two tabs can both pass the duplicate check; the index on (user_id, key)
// then refuses the second write, with an error that names it. D1 and drizzle
// may wrap it, so the causes are read too.
const isKeyTaken = (error: unknown): boolean =>
	error instanceof Error &&
	(error.message.includes("combination.user_id, combination.key") ||
		isKeyTaken(error.cause));

// The first piece whose colour is not one of the account's, as the problem.
// A filter row may leave its colour out; with no colour named there is
// nothing to check, and the colour list is not read, since a first read
// writes the starter colours.
async function notYourColour(
	db: Db,
	userId: string,
	pieces: readonly { colourId?: string }[],
): Promise<CombinationProblem | null> {
	if (pieces.every((p) => p.colourId === undefined)) return null;
	const colourIds = new Set<string>(
		(await listColours(db, userId)).map((c) => c.id),
	);
	const i = pieces.findIndex(
		(p) => p.colourId !== undefined && !colourIds.has(p.colourId),
	);
	return i === -1
		? null
		: {
				code: "not_colour",
				path: ["pieces", i, "colourId"],
				value: pieces[i].colourId,
			};
}

// One insert for each piece, written only while the combination is the
// account's (ours), so a combination deleted meanwhile gets no pieces.
const pieceWrites = (db: Db, pieces: CombinationInput["pieces"], ours: SQL) =>
	pieces.map((piece) =>
		db
			.insert(combinationPiece)
			.select(
				db
					.select({
						combinationId: combination.id,
						userId: combination.userId,
						layer: sql<string>`${LAYER_OF[piece.typeId]}`.as("layer"),
						typeId: sql<string>`${piece.typeId}`.as("type_id"),
						colourId: sql<string>`${piece.colourId}`.as("colour_id"),
					})
					.from(combination)
					.where(ours),
			)
			.onConflictDoNothing(),
	);

async function notYourTag(
	db: Db,
	userId: string,
	tags: readonly string[],
): Promise<CombinationProblem | null> {
	if (tags.length === 0) return null;
	const tagIds = new Set<string>((await listTags(db, userId)).map((t) => t.id));
	const value = tags.find((id) => !tagIds.has(id));
	return value === undefined
		? null
		: { code: "not_tag", path: ["tags"], value };
}

// One insert of the combination's tag links. It reads the tag table, so a
// tag deleted after the check writes no link, and it writes only while the
// combination is the account's (ours), so a combination not written gets
// none.
const tagLinks = (
	db: Db,
	userId: string,
	id: string,
	tags: readonly string[],
	ours: SQL,
) =>
	db
		.insert(combinationTag)
		.select(
			db
				.select({
					userId: tag.userId,
					combinationId: sql<string>`${id}`.as("combination_id"),
					tagId: tag.id,
				})
				.from(tag)
				.where(
					and(
						eq(tag.userId, userId),
						inArray(tag.id, [...new Set(tags)]),
						exists(db.select({ one: sql`1` }).from(combination).where(ours)),
					),
				),
		)
		.onConflictDoNothing();

// The clear and the insert go in one batch, so two writes at once leave one
// write's tags, never a mix.
const replaceTags = (
	db: Db,
	userId: string,
	id: string,
	tags: readonly string[],
	ours: SQL,
) =>
	[
		db
			.delete(combinationTag)
			.where(
				and(
					eq(combinationTag.combinationId, id),
					eq(combinationTag.userId, userId),
				),
			),
		...(tags.length ? [tagLinks(db, userId, id, tags, ours)] : []),
	] as const;

// The page makes the id when the save form opens, so a Save sent again after
// a lost answer gives back the same combination rather than a second one. An
// id another account holds, or one saved with other pieces, is conflict. A
// save sent again writes its tags, since the form may have changed them. The
// same pieces under another id is duplicate, with its id. A
// new combination past the limit is not saved: combination_limit. The count
// sits in the insert, so two saves at once cannot both pass it.
export async function saveCombination(
	db: Db,
	userId: string,
	draft: CombinationDraft,
): Promise<Result<SavedCombination, CombinationError>> {
	const checked = checkCombination(draft);
	if (!checked.ok) return { ok: false, error: checked.problem };
	const input = checked.combination;
	const notColour = await notYourColour(db, userId, input.pieces);
	if (notColour) return { ok: false, error: notColour };
	const notTag = await notYourTag(db, userId, input.tags);
	if (notTag) return { ok: false, error: notTag };
	const key = combinationKey(input.pieces);
	const conflict = { ok: false, error: { code: "conflict" } } as const;
	const [before] = await db
		.select({ userId: combination.userId, key: combination.key })
		.from(combination)
		.where(eq(combination.id, input.id));
	const ours = sql`${eq(combination.id, input.id)} and ${eq(combination.userId, userId)}`;
	if (before) {
		if (before.userId !== userId || before.key !== key) return conflict;
		await db.batch(replaceTags(db, userId, input.id, input.tags, ours));
		const [same] = await readCombinations(db, userId, input.id);
		return same
			? { ok: true, value: { combination: same, created: false } }
			: conflict;
	}
	const held = await keyHolder(db, userId, key);
	if (held) return { ok: false, error: { code: "duplicate", id: held } };
	try {
		await db.batch([
			db
				.insert(combination)
				.select(
					db
						.select({
							id: sql<string>`${input.id}`.as("id"),
							userId: user.id,
							key: sql<string>`${key}`.as("key"),
							createdAt:
								sql<number>`(cast(unixepoch('subsecond') * 1000 as integer))`.as(
									"created_at",
								),
						})
						.from(user)
						.where(
							and(
								eq(user.id, userId),
								sql`(${db
									.select({ n: count() })
									.from(combination)
									.where(
										eq(combination.userId, userId),
									)}) < ${COMBINATION_LIMIT}`,
							),
						),
				)
				.onConflictDoNothing({ target: combination.id }),
			...pieceWrites(db, input.pieces, ours),
			...(input.tags.length
				? [tagLinks(db, userId, input.id, input.tags, ours)]
				: []),
		]);
	} catch (error) {
		const taken = isKeyTaken(error) && (await keyHolder(db, userId, key));
		if (!taken) throw error;
		return { ok: false, error: { code: "duplicate", id: taken } };
	}
	const [saved] = await readCombinations(db, userId, input.id);
	if (saved) return { ok: true, value: { combination: saved, created: true } };
	const [taken] = await db
		.select({ id: combination.id })
		.from(combination)
		.where(eq(combination.id, input.id));
	return taken ? conflict : { ok: false, error: { code: "combination_limit" } };
}

// Finds the account's combination by id and swaps its pieces whole, in one
// batch, so two tabs that change it at once leave one tab's pieces, never a
// mix. createdAt stays, so it keeps its place on the wall. The same pieces
// again write only the tags, and nothing when tags are left out. Pieces another of the account's combinations holds
// are duplicate, with its id; the index on (user_id, key) catches two tabs
// that pass that check at once. A combination deleted while the batch runs
// gets no pieces and answers not_found.
export async function changeCombination(
	db: Db,
	userId: string,
	id: string,
	change: CombinationChange,
): Promise<Result<Combination, CombinationError>> {
	const ours = sql`${eq(combination.id, id)} and ${eq(combination.userId, userId)}`;
	const notFound = { ok: false, error: { code: "not_found" } } as const;
	const [stored] = await db
		.select({ key: combination.key })
		.from(combination)
		.where(ours);
	if (!stored) return notFound;
	const checked = checkCombination({
		id,
		pieces: change.pieces,
		tags: change.tags ?? [],
	});
	if (!checked.ok) return { ok: false, error: checked.problem };
	const input = checked.combination;
	const notColour = await notYourColour(db, userId, input.pieces);
	if (notColour) return { ok: false, error: notColour };
	if (change.tags) {
		const notTag = await notYourTag(db, userId, input.tags);
		if (notTag) return { ok: false, error: notTag };
	}
	const key = combinationKey(input.pieces);
	const piecesChange = key !== stored.key;
	if (piecesChange) {
		const held = await keyHolder(db, userId, key);
		if (held && held !== id)
			return { ok: false, error: { code: "duplicate", id: held } };
	}
	const pieceStatements = piecesChange
		? [
				db.update(combination).set({ key }).where(ours),
				db
					.delete(combinationPiece)
					.where(
						and(
							eq(combinationPiece.combinationId, id),
							eq(combinationPiece.userId, userId),
						),
					),
				...pieceWrites(db, input.pieces, ours),
			]
		: [];
	const tagStatements = change.tags
		? replaceTags(db, userId, id, input.tags, ours)
		: [];
	const [first, ...rest] = [...pieceStatements, ...tagStatements];
	if (first) {
		try {
			await db.batch([first, ...rest]);
		} catch (error) {
			const taken = isKeyTaken(error) && (await keyHolder(db, userId, key));
			if (!taken) throw error;
			return { ok: false, error: { code: "duplicate", id: taken } };
		}
	}
	const [changed] = await readCombinations(db, userId, id);
	return changed ? { ok: true, value: changed } : notFound;
}

// Only the account's own combination goes, with its pieces (the key's
// cascade); not_found when there is none to delete.
export async function deleteCombination(
	db: Db,
	userId: string,
	id: string,
): Promise<Result<CombinationId, CombinationError>> {
	const [row] = await db
		.delete(combination)
		.where(and(eq(combination.id, id), eq(combination.userId, userId)))
		.returning({ id: combination.id });
	return row
		? { ok: true, value: row.id as CombinationId }
		: { ok: false, error: { code: "not_found" } };
}
