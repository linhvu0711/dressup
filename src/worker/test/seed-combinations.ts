import { combinationKey } from "@/combinations/combination";
import { type GarmentId, LAYER_OF } from "@/dress/garments";
import { listColours } from "../colour-store";
import type { Db } from "../db";
import { combination, combinationPiece } from "../db/combination-schema";

const BOTTOMS: GarmentId[] = [
	"casual_sh",
	"chino_sh",
	"chino_p",
	"casual_p",
	"train_sh",
	"train_p",
];

const TOPS: GarmentId[] = ["tee_s", "tee_l", "polo_s", "polo_l"];

// D1 takes at most 100 bound values in one statement; a combination binds 4
// and its two pieces 10, so 9 combinations go in each pair of inserts.
const CHUNK = 9;

// Writes n combinations for the account, each with other pieces and no
// jacket, so a test or the e2e setup can reach the limit without n requests.
// Combination i has a bottom and a top in the account's first colour.
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
	for (let i = 0; i < all.length; i += CHUNK) {
		const chunk = all.slice(i, i + CHUNK);
		await db.insert(combination).values(
			chunk.map(({ id, pieces }) => ({
				id,
				userId,
				key: combinationKey(pieces, false),
				open: false,
			})),
		);
		await db.insert(combinationPiece).values(
			chunk.flatMap(({ id, pieces }) =>
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
}
