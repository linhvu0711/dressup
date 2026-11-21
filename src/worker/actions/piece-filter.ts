import { z } from "zod";
import { isTypeId } from "@/dress/clothing-types";
import type { BrandId } from "@/labels/brand";
import type { ColourId } from "@/labels/colour";
import { NO_FILTER, type PieceFilter } from "@/piece-filter/piece-filter";
import { listBrands } from "../brand-store";
import { listColours } from "../colour-store";
import type { Result } from "../result";
import {
	type ActionScope,
	notAType,
	notYourBrand,
	notYourColour,
	type Refusals,
} from "./action";

export type PieceFilterError =
	| { code: "not_type"; value: string }
	| { code: "not_colour"; value: string }
	| { code: "not_brand"; value: string };

// Loose strings on purpose, as the add tools: a type or an id that is not one
// must reach pieceFilterOf to get a sentence.
export const pieceFilterInput = z.object({
	types: z
		.array(z.string())
		.optional()
		.describe("Type ids from list_types. A piece of any of them matches."),
	colourIds: z
		.array(z.string())
		.optional()
		.describe("Colour ids from list_colours. A piece in any of them matches."),
	brandIds: z
		.array(z.string().nullable())
		.optional()
		.describe(
			"Brand ids from list_brands, and null for no brand. Any of them matches.",
		),
});

const badFilter = (field: "types" | "colourIds" | "brandIds") => ({
	status: 400 as const,
	body: { error: "invalid" as const, field },
});

export const pieceFilterRefusals: Refusals<PieceFilterError> = {
	not_type: (error) => ({ ...badFilter("types"), text: notAType(error.value) }),
	not_colour: (error) => ({
		...badFilter("colourIds"),
		text: notYourColour(error.value),
	}),
	not_brand: (error) => ({
		...badFilter("brandIds"),
		text: notYourBrand(error.value),
	}),
};

// An unknown value is refused, not left out: a list from a wrong id would
// read as a true answer.
export async function pieceFilterOf(
	{ db, userId }: ActionScope,
	input: z.output<typeof pieceFilterInput>,
): Promise<Result<PieceFilter, PieceFilterError>> {
	const { types = [], colourIds = [], brandIds = [] } = input;
	const badType = types.find((t) => !isTypeId(t));
	if (badType !== undefined)
		return { ok: false, error: { code: "not_type", value: badType } };
	if (colourIds.length > 0) {
		const colours = await listColours(db, userId);
		const bad = colourIds.find((id) => !colours.some((c) => c.id === id));
		if (bad !== undefined)
			return { ok: false, error: { code: "not_colour", value: bad } };
	}
	if (brandIds.some((id) => id !== null)) {
		const brands = new Set<string>(
			(await listBrands(db, userId)).map((b) => b.id),
		);
		const bad = brandIds.find(
			(id): id is string => id !== null && !brands.has(id),
		);
		if (bad !== undefined)
			return { ok: false, error: { code: "not_brand", value: bad } };
	}
	return {
		ok: true,
		value: {
			...NO_FILTER,
			types: types as PieceFilter["types"],
			colours: colourIds as ColourId[],
			brands: brandIds as (BrandId | null)[],
		},
	};
}
