import { z } from "zod";
import { GARMENT_IDS } from "@/dress/garments";
import { brandSchema } from "@/labels/brand";
import { colourSchema } from "@/labels/colour";

export const WISH_LIMIT = 200;

export const SHOP_LINK_LIMIT = 10;

export const ADDRESS_MAX = 2000;

export const SHOP_LINK_NAME_MAX = 80;

export const PRICE_MAX = 999_999_999;

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

// Only an http or https address that parses with a host: the page draws a
// saved address as a link, so a script address must never be saved.
export const webAddressSchema = z
	.string()
	.trim()
	.max(ADDRESS_MAX)
	.regex(/^https?:\/\/\S+$/i)
	.refine(
		(url) =>
			URL.canParse(url) &&
			/^https?:$/.test(new URL(url).protocol) &&
			new URL(url).hostname !== "",
	);

// A price in whole VND; null when the user leaves it empty.
export const priceSchema = z.number().int().min(1).max(PRICE_MAX).nullable();

// The rules for a shop link as a website or an AI app sends it. The brand is
// an id here; the store checks that it is the account's.
export const shopLinkInputSchema = z.object({
	id: shopLinkIdSchema,
	url: webAddressSchema,
	brandId: z.string().nullable(),
	name: z.string().trim().min(1).max(SHOP_LINK_NAME_MAX),
	price: priceSchema,
});

export const shopLinkChangeSchema = shopLinkInputSchema.omit({ id: true });

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
