import { z } from "zod";
import { hexSchema } from "@/colour/hex";

export const COLOUR_NAME_MAX = 24;

export const COLOUR_LIMIT = 100;

export const colourIdSchema = z.uuid().brand<"ColourId">();

export type ColourId = z.infer<typeof colourIdSchema>;

// The one rule for a colour's fields, so the server's check, the AI tools,
// and the page's parse are the same.
export const colourInputSchema = z.object({
	name: z.string().trim().min(1).max(COLOUR_NAME_MAX),
	hex: hexSchema,
});

export const colourSchema = colourInputSchema.extend({ id: colourIdSchema });

export type Colour = z.infer<typeof colourSchema>;
