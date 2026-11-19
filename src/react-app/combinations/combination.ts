import { z } from "zod";
import {
	type FigureLayer,
	type Hex,
	LAYER_OF,
	LAYERS,
	type Layer,
	TYPE_IDS,
	TYPE_NAMES,
	type TypeId,
} from "@/dress/clothing-types";
import { colourSchema } from "@/labels/colour";
import { tagIdSchema } from "@/tags/tag";

// Combinations for each account (docs/adr/0008-open-sign-up-with-limits.md).
export const COMBINATION_LIMIT = 300;

// A combination's tags go in one statement, and D1 takes at most 100 bound
// parameters (https://developers.cloudflare.com/d1/platform/limits/).
export const COMBINATION_TAGS_MAX = 50;

export const combinationIdSchema = z.uuid().brand<"CombinationId">();

export type CombinationId = z.infer<typeof combinationIdSchema>;

// The one shape of a combination as a website or an AI app sends it, so the
// server's check and the page's parse are the same.
export const combinationInputSchema = z
	.object({
		id: combinationIdSchema,
		pieces: z
			.array(z.object({ typeId: z.enum(TYPE_IDS), colourId: z.string() }))
			.min(2)
			.max(4),
		tags: z.array(tagIdSchema).max(COMBINATION_TAGS_MAX).default([]),
	})
	.superRefine((combination, ctx) => {
		const seen = new Map<Layer, TypeId>();
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
type SameLayer = { typeId: TypeId; other: TypeId; layer: Layer };

export type CombinationInput = z.infer<typeof combinationInputSchema>;

// What the page sends: tags left out on a change keep the stored ones.
export type CombinationBody = Omit<CombinationInput, "tags"> &
	Partial<Pick<CombinationInput, "tags">>;

export const combinationSchema = z.object({
	id: combinationIdSchema,
	pieces: z.array(
		z.object({
			layer: z.enum(LAYERS),
			typeId: z.enum(TYPE_IDS),
			colour: colourSchema,
		}),
	),
	tags: z.array(tagIdSchema),
});

export type Combination = z.infer<typeof combinationSchema>;

// What a combination's own rules refuse, so the website and the AI apps each
// turn one code into their answer. path is the zod path of the refused value.
export type CombinationProblem =
	| {
			code: "not_type" | "not_colour" | "not_tag";
			path: PropertyKey[];
			value: unknown;
	  }
	| { code: "too_many_tags"; path: PropertyKey[] }
	| { code: "pieces_count"; path: PropertyKey[] }
	| ({ code: "same_layer"; path: PropertyKey[] } & SameLayer)
	| {
			code: "invalid";
			path: PropertyKey[];
			issue: z.core.$ZodIssue;
	  };

const valueAt = (input: unknown, path: readonly PropertyKey[]): unknown =>
	path.reduce<unknown>(
		(value, key) =>
			value !== null && typeof value === "object"
				? (value as Record<PropertyKey, unknown>)[key]
				: undefined,
		input,
	);

export function checkCombination(
	input: unknown,
):
	| { ok: true; combination: CombinationInput }
	| { ok: false; problem: CombinationProblem } {
	const parsed = combinationInputSchema.safeParse(input);
	if (parsed.success) return { ok: true, combination: parsed.data };
	const issue = parsed.error.issues[0];
	const path = [...issue.path];
	if (issue.code === "custom")
		return {
			ok: false,
			problem: { code: "same_layer", path, ...(issue.params as SameLayer) },
		};
	if (path[0] === "tags")
		return issue.code === "too_big" && path.length === 1
			? { ok: false, problem: { code: "too_many_tags", path } }
			: {
					ok: false,
					problem: {
						code: "not_tag",
						path: ["tags"],
						value: valueAt(input, path),
					},
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
	return { ok: false, problem: { code: "invalid", path, issue } };
}

const byLayer = <T extends { typeId: TypeId }>(pieces: readonly T[]): T[] =>
	[...pieces].sort(
		(a, b) =>
			LAYERS.indexOf(LAYER_OF[a.typeId]) - LAYERS.indexOf(LAYER_OF[b.typeId]),
	);

// The pieces as one text, bottom layer first, so the same pieces in any order
// make one key and the database can refuse a second combination of them.
export function combinationKey(
	pieces: readonly { typeId: TypeId; colourId: string }[],
): string {
	return byLayer(pieces)
		.map((p) => `${p.typeId}:${p.colourId}`)
		.join("+");
}

// A type's name inside a title: "long tee", but "Harrington jacket", since
// Harrington is a name.
const typeWord = (id: TypeId) => {
	const name = TYPE_NAMES[id];
	return id === "harrington" ? name : name[0].toLowerCase() + name.slice(1);
};

// The order a combination is read in: the top layer first.
export const topFirst = <T extends { typeId: TypeId }>(
	pieces: readonly T[],
): T[] => byLayer(pieces).reverse();

// A piece as the title and the piece lines name it: "Black long tee".
export function pieceName(piece: {
	typeId: TypeId;
	colour: { name: string };
}): string {
	return `${piece.colour.name} ${typeWord(piece.typeId)}`;
}

// The pieces, top layer first, as "Khaki Harrington jacket + Black long
// tee + Navy casual pants".
export function combinationTitle(combination: {
	pieces: readonly { typeId: TypeId; colour: { name: string } }[];
}): string {
	return topFirst(combination.pieces).map(pieceName).join(" + ");
}

// The pale piece the mannequin wears in place of a missing bottom or top: the
// bare figure leaves the body from the waist to the knee undrawn
// (src/react-app/dress/figure/body.tsx). It is never saved.
export const BLANK: Hex = "#E2DED7";

// What the mannequin wears for these pieces, bottom layer first: a pale
// casual pants with no bottom, and a pale short tee with no inner top and no
// sweater.
export function wornLayers(
	pieces: readonly { typeId: TypeId; hex: Hex }[],
): FigureLayer[] {
	const worn: FigureLayer[] = byLayer(pieces).map((p) => ({
		typeId: p.typeId,
		color: p.hex,
	}));
	const blank = (typeId: TypeId): FigureLayer[] => [{ typeId, color: BLANK }];
	const bottom = worn.filter((l) => LAYER_OF[l.typeId] === "bottom");
	const above = worn.filter((l) => LAYER_OF[l.typeId] !== "bottom");
	const hasTop = above.some((l) => LAYER_OF[l.typeId] !== "jacket");
	return [
		...(bottom.length > 0 ? bottom : blank("casual_p")),
		...(hasTop ? [] : blank("tee_s")),
		...above,
	];
}
