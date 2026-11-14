import { z } from "zod";
import { GARMENT_IDS, type GarmentId, JACKET_IDS } from "@/dress/garments";
import { MODES, modeById } from "@/dress/modes";
import { type DressState, hexSchema, modeIdSchema } from "@/dress/state";
import { type TagId, tagIdSchema } from "@/tags/tag";

export const LOOK_NAME_MAX = 60;

// Looks for each account (docs/adr/0008-open-sign-up-with-limits.md).
export const LOOK_LIMIT = 300;

// A look's tags go in one statement, and D1 takes at most 100 bound
// parameters (src/worker/dress-store.ts:30-31).
export const LOOK_TAGS_MAX = 50;

const lookIdSchema = z.uuid().brand<"LookId">();

export type LookId = z.infer<typeof lookIdSchema>;

// The one shape of a look, so the server's check and the page's parse are
// the same. A look keeps its own copy of the colours of its mode's garments.
export const lookInputSchema = z
	.object({
		id: lookIdSchema,
		modeId: modeIdSchema,
		name: z.string().trim().max(LOOK_NAME_MAX),
		colours: z.partialRecord(z.enum(GARMENT_IDS), hexSchema),
		open: z.array(z.enum(JACKET_IDS)),
		tags: z.array(tagIdSchema).max(LOOK_TAGS_MAX).default([]),
	})
	.superRefine((look, ctx) => {
		// Zod runs this after a failed modeId too, and modeById would throw.
		const mode = MODES.find((m) => m.id === look.modeId);
		if (!mode) return;
		const inMode = (id: GarmentId) => mode.garments.includes(id);
		for (const id of Object.keys(look.colours) as GarmentId[])
			if (!inMode(id))
				ctx.addIssue({
					code: "custom",
					path: ["colours", id],
					message: "not in the mode",
				});
		for (const id of mode.garments)
			if (!look.colours[id])
				ctx.addIssue({
					code: "custom",
					path: ["colours", id],
					message: "no colour",
				});
		if (look.open.some((id) => !inMode(id)))
			ctx.addIssue({
				code: "custom",
				path: ["open"],
				message: "not in the mode",
			});
	});

export type LookInput = z.infer<typeof lookInputSchema>;

export const lookSchema = lookInputSchema;

export type Look = LookInput;

// The outfit on the mannequin as a look: only its mode's garments.
export function lookFromDress(
	state: DressState,
	id: LookId,
	name: string,
	tags: TagId[],
): LookInput {
	const mode = modeById(state.modeId);
	return {
		id,
		modeId: state.modeId,
		name,
		colours: Object.fromEntries(mode.garments.map((g) => [g, state.picked[g]])),
		open: state.open.filter((j) => mode.garments.includes(j)),
		tags,
	};
}

// A look with no name shows its mode's name (docs/prototype/dressup.html:791).
export const lookName = (look: Look): string =>
	look.name || modeById(look.modeId).name;
