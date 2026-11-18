import { z } from "zod";
import { GARMENT_IDS } from "@/dress/garments";
import { brandSchema } from "@/labels/brand";
import { colourSchema } from "@/labels/colour";

export const OWNED_ITEM_LIMIT = 500;

export const QUANTITY_MAX = 99;

export const ownedItemIdSchema = z.uuid().brand<"OwnedItemId">();

export type OwnedItemId = z.infer<typeof ownedItemIdSchema>;

export const quantitySchema = z.number().int().min(1).max(QUANTITY_MAX);

// The rules for an owned item as a website or an AI app sends it, so the
// server's check and the page's form agree. The colour and the brand are
// ids here; the store checks that they are the account's.
export const ownedItemInputSchema = z.object({
	id: ownedItemIdSchema,
	typeId: z.enum(GARMENT_IDS),
	colourId: z.string(),
	brandId: z.string().nullable(),
	quantity: quantitySchema,
});

// The piece of an owned item never changes; only its brand and quantity do.
export const ownedItemChangeSchema = z.object({
	brandId: z.string().nullable(),
	quantity: quantitySchema,
});

export const ownedItemSchema = z.object({
	id: ownedItemIdSchema,
	typeId: z.enum(GARMENT_IDS),
	colour: colourSchema,
	brand: brandSchema.nullable(),
	quantity: quantitySchema,
});

export type OwnedItem = z.infer<typeof ownedItemSchema>;
