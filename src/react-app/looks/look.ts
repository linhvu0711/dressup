import { z } from "zod";
import { GARMENT_IDS, type GarmentId, JACKET_IDS } from "@/dress/garments";
import { MODES } from "@/dress/modes";
import { hexSchema, modeIdSchema } from "@/dress/state";

export const LOOK_NAME_MAX = 60;

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
