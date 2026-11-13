import { z } from "zod";
import { GARMENT_IDS, JACKET_IDS } from "@/dress/garments";
import { hexSchema, modeIdSchema } from "@/dress/state";

export const LOOK_NAME_MAX = 60;

const lookIdSchema = z.uuid().brand<"LookId">();

export type LookId = z.infer<typeof lookIdSchema>;

// The one shape of a look, so the server's check and the page's parse are
// the same. A look keeps its own copy of the colours of its mode's garments.
export const lookInputSchema = z.object({
	id: lookIdSchema,
	modeId: modeIdSchema,
	name: z.string().trim().max(LOOK_NAME_MAX),
	colours: z.partialRecord(z.enum(GARMENT_IDS), hexSchema),
	open: z.array(z.enum(JACKET_IDS)),
});

export type LookInput = z.infer<typeof lookInputSchema>;

export const lookSchema = lookInputSchema;

export type Look = LookInput;
