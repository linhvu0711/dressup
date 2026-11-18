import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import type { Hex } from "@/colour/hex";
import {
	COMBINATION_LIMIT,
	type Combination,
	type CombinationId,
	type CombinationProblem,
	checkCombination,
	combinationKey,
} from "@/combinations/combination";
import { LAYER_OF, LAYERS } from "@/dress/garments";
import type { ColourId } from "@/labels/colour";
import { listColours } from "./colour-store";
import type { Db } from "./db";
import { user } from "./db/auth-schema";
import { colour } from "./db/colour-schema";
import { combination, combinationPiece } from "./db/combination-schema";
import type { Result } from "./result";

// A combination as a website or an AI app sends it, before the rules ran.
export type CombinationDraft = {
	id: string;
	pieces: { typeId: string; colourId: string }[];
	open: boolean;
};

export type CombinationError =
	| CombinationProblem
	| { code: "conflict" }
	| { code: "duplicate"; id: CombinationId }
	| { code: "combination_limit" };

export type SavedCombination = { combination: Combination; created: boolean };

// The account's combinations, newest first, or the one with this id.
async function readCombinations(
	db: Db,
	userId: string,
	id?: string,
): Promise<Combination[]> {
	const [rows, pieces] = await db.batch([
		db
			.select({ id: combination.id, open: combination.open })
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
	]);
	return rows.map((row) => ({
		id: row.id as CombinationId,
		open: row.open,
		pieces: pieces
			.filter((p) => p.combinationId === row.id)
			.sort((a, b) => LAYERS.indexOf(a.layer) - LAYERS.indexOf(b.layer))
			.map((p) => ({
				layer: p.layer,
				typeId: p.typeId,
				colour: { id: p.colourId as ColourId, name: p.name, hex: p.hex as Hex },
			})),
	}));
}

export const listCombinations = (db: Db, userId: string) =>
	readCombinations(db, userId);

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

// The page makes the id when the save form opens, so a Save sent again after
// a lost answer gives back the same combination rather than a second one. An
// id another account holds, or one saved with other pieces, is conflict. The
// same pieces and jacket state under another id is duplicate, with its id. A
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
	const colourIds = new Set<string>(
		(await listColours(db, userId)).map((c) => c.id),
	);
	const notColour = input.pieces.findIndex((p) => !colourIds.has(p.colourId));
	if (notColour !== -1)
		return {
			ok: false,
			error: {
				code: "not_colour",
				path: ["pieces", notColour, "colourId"],
				value: input.pieces[notColour].colourId,
			},
		};
	const key = combinationKey(input.pieces, input.open);
	const conflict = { ok: false, error: { code: "conflict" } } as const;
	const [before] = await db
		.select({ userId: combination.userId, key: combination.key })
		.from(combination)
		.where(eq(combination.id, input.id));
	if (before) {
		if (before.userId !== userId || before.key !== key) return conflict;
		const [same] = await readCombinations(db, userId, input.id);
		return same
			? { ok: true, value: { combination: same, created: false } }
			: conflict;
	}
	const held = await keyHolder(db, userId, key);
	if (held) return { ok: false, error: { code: "duplicate", id: held } };
	const ours = and(
		eq(combination.id, input.id),
		eq(combination.userId, userId),
	);
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
							open: sql<number>`${input.open ? 1 : 0}`.as("open"),
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
			...input.pieces.map((piece) =>
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
			),
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
