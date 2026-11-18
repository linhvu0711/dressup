import { z } from "zod";
import { GARMENT_IDS } from "@/dress/garments";
import { brandSchema } from "@/labels/brand";
import { colourSchema } from "@/labels/colour";

export const WISH_LIMIT = 200;

export const wishIdSchema = z.uuid().brand<"WishId">();

export type WishId = z.infer<typeof wishIdSchema>;

// The rules for a wish as a website or an AI app sends it, so the server's
// check and the page's form agree. The colour is an id here; the store
// checks that it is the account's.
export const wishInputSchema = z.object({
	id: wishIdSchema,
	typeId: z.enum(GARMENT_IDS),
	colourId: z.string(),
});

export const shopLinkIdSchema = z.uuid().brand<"ShopLinkId">();

export type ShopLinkId = z.infer<typeof shopLinkIdSchema>;

export const shopLinkSchema = z.object({
	id: shopLinkIdSchema,
	url: z.string(),
	brand: brandSchema.nullable(),
	name: z.string(),
	price: z.number().int().nullable(),
});

export type ShopLink = z.infer<typeof shopLinkSchema>;

export const wishSchema = z.object({
	id: wishIdSchema,
	typeId: z.enum(GARMENT_IDS),
	colour: colourSchema,
	shopLinks: z.array(shopLinkSchema),
});

export type Wish = z.infer<typeof wishSchema>;
