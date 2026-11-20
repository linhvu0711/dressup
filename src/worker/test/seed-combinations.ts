import { combinationKey } from "@/combinations/combination";
import { LAYER_OF, type TypeId } from "@/dress/clothing-types";
import { listColours } from "../colour-store";
import type { Db } from "../db";
import { combination, combinationPiece } from "../db/combination-schema";
import { insertInChunks } from "./insert-in-chunks";

const BOTTOMS: TypeId[] = [
	"casual_sh",
	"chino_sh",
	"chino_p",
	"casual_p",
	"train_sh",
	"train_p",
];

const TOPS: TypeId[] = ["tee_s", "tee_l", "polo_s", "polo_l"];

// Writes n combinations for the account, each with other pieces and no
// jacket, so a test or the e2e setup can reach the limit without n requests.
// Combination i has a top in the account's first colour, and a bottom whose
// colour moves on every 6 combinations.
export async function seedCombinations(db: Db, userId: string, n: number) {
	const colours = await listColours(db, userId);
	const all = Array.from({ length: n }, (_, i) => {
		const pieces = [
			{
				typeId: BOTTOMS[i % BOTTOMS.length],
				colourId: colours[Math.floor(i / BOTTOMS.length) % colours.length].id,
			},
			{
				typeId: TOPS[Math.floor(i / (BOTTOMS.length * colours.length))],
				colourId: colours[0].id,
			},
		];
		return {
			id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
			pieces,
		};
	});
	await insertInChunks(
		db,
		combination,
		all.map(({ id, pieces }) => ({ id, userId, key: combinationKey(pieces) })),
	);
	await insertInChunks(
		db,
		combinationPiece,
		all.flatMap(({ id, pieces }) =>
			pieces.map((p) => ({
				combinationId: id,
				userId,
				layer: LAYER_OF[p.typeId],
				typeId: p.typeId,
				colourId: p.colourId,
			})),
		),
	);
}
