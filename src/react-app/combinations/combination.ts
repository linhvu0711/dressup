import { z } from "zod";
import {
	GARMENT_IDS,
	type GarmentId,
	LAYER_OF,
	LAYERS,
	type Layer,
} from "@/dress/garments";
import { colourSchema } from "@/labels/colour";

// Combinations for each account (docs/adr/0008-open-sign-up-with-limits.md).
export const COMBINATION_LIMIT = 300;

export const combinationIdSchema = z.uuid().brand<"CombinationId">();

export type CombinationId = z.infer<typeof combinationIdSchema>;

// The one shape of a combination as a website or an AI app sends it, so the
// server's check and the page's parse are the same.
export const combinationInputSchema = z
	.object({
		id: combinationIdSchema,
		pieces: z
			.array(z.object({ typeId: z.enum(GARMENT_IDS), colourId: z.string() }))
			.min(2)
			.max(4),
		open: z.boolean(),
	})
	.superRefine((combination, ctx) => {
		const seen = new Map<Layer, GarmentId>();
		for (const [i, { typeId }] of combination.pieces.entries()) {
			const layer = LAYER_OF[typeId];
			const other = seen.get(layer);
			if (other) {
				ctx.addIssue({
					code: "custom",
					path: ["pieces", i, "typeId"],
					message: "a second piece in the layer",
					params: { typeId, other, layer } satisfies SameLayer,
				});
				return;
			}
			seen.set(layer, typeId);
		}
	});

// zod types params as Record<string, any>, so the layer rule writes its
// params to this shape and checkCombination reads them back.
type SameLayer = { typeId: GarmentId; other: GarmentId; layer: Layer };

export type CombinationInput = z.infer<typeof combinationInputSchema>;

export const combinationSchema = z.object({
	id: combinationIdSchema,
	pieces: z.array(
		z.object({
			layer: z.enum(LAYERS),
			typeId: z.enum(GARMENT_IDS),
			colour: colourSchema,
		}),
	),
	open: z.boolean(),
});

export type Combination = z.infer<typeof combinationSchema>;

// What a combination's own rules refuse, so the website and the AI apps each
// turn one code into their answer. path is the zod path of the refused value.
export type CombinationProblem =
	| { code: "not_type" | "not_colour"; path: PropertyKey[]; value: unknown }
	| { code: "pieces_count"; path: PropertyKey[] }
	| ({ code: "same_layer"; path: PropertyKey[] } & SameLayer)
	| {
			code: "invalid";
			path: PropertyKey[];
			issue: z.core.$ZodIssue;
			input: unknown;
	  };

const hasJacket = (pieces: readonly { typeId: GarmentId }[]) =>
	pieces.some((p) => LAYER_OF[p.typeId] === "jacket");

const valueAt = (input: unknown, path: readonly PropertyKey[]): unknown =>
	path.reduce<unknown>(
		(value, key) =>
			value !== null && typeof value === "object"
				? (value as Record<PropertyKey, unknown>)[key]
				: undefined,
		input,
	);

// The jacket state counts only with a jacket, so a combination with no jacket
// has one identity however open was sent.
export function checkCombination(
	input: unknown,
):
	| { ok: true; combination: CombinationInput }
	| { ok: false; problem: CombinationProblem } {
	const parsed = combinationInputSchema.safeParse(input);
	if (parsed.success) {
		const combination = parsed.data;
		return {
			ok: true,
			combination: {
				...combination,
				open: combination.open && hasJacket(combination.pieces),
			},
		};
	}
	const issue = parsed.error.issues[0];
	const path = [...issue.path];
	if (issue.code === "custom")
		return {
			ok: false,
			problem: { code: "same_layer", path, ...(issue.params as SameLayer) },
		};
	if (
		(issue.code === "too_small" || issue.code === "too_big") &&
		path.length === 1 &&
		path[0] === "pieces"
	)
		return { ok: false, problem: { code: "pieces_count", path } };
	if (issue.code === "invalid_value" && path[path.length - 1] === "typeId")
		return {
			ok: false,
			problem: { code: "not_type", path, value: valueAt(input, path) },
		};
	return { ok: false, problem: { code: "invalid", path, issue, input } };
}

const byLayer = <T extends { typeId: GarmentId }>(pieces: readonly T[]): T[] =>
	[...pieces].sort(
		(a, b) =>
			LAYERS.indexOf(LAYER_OF[a.typeId]) - LAYERS.indexOf(LAYER_OF[b.typeId]),
	);

// The pieces and the jacket state as one text, so the database can refuse a
// second combination with the same identity.
export function combinationKey(
	pieces: readonly { typeId: GarmentId; colourId: string }[],
	open: boolean,
): string {
	const key = byLayer(pieces)
		.map((p) => `${p.typeId}:${p.colourId}`)
		.join("+");
	return open && hasJacket(pieces) ? `${key}|open` : key;
}
