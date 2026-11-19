import { z } from "zod";
import { aiAppSchema } from "@/ai-apps/ai-app";
import { ownedItemSchema } from "@/closet/owned-item";
import { combinationSchema } from "@/combinations/combination";
import { brandSchema, listedBrandSchema } from "@/labels/brand";
import { colourSchema, listedColourSchema } from "@/labels/colour";
import { mannequinSchema } from "@/mannequin/mannequin";
import { pictureIdSchema } from "@/pictures/picture";
import { listedTagSchema, tagSchema } from "@/tags/tag";
import { wishSchema } from "@/wishlist/wish";

// The answers the worker sends and the web app reads, so a renamed key or
// code breaks the check on both sides. Zod only: the worker compiles this.

export const errorCodes = [
	"unauthorized",
	"invalid",
	"conflict",
	"not_found",
	"duplicate",
	"colour_limit",
	"brand_limit",
	"combination_limit",
	"owned_item_limit",
	"colour_in_use",
	"wish_limit",
	"shop_link_limit",
	"too_large",
	"picture_limit",
	"account_picture_limit",
	"storage_full",
] as const;

export type ErrorCode = (typeof errorCodes)[number];

export const errorAnswer = z.object({
	error: z.enum(errorCodes),
	field: z.string().optional(),
	id: z.string().optional(),
});

export type ErrorAnswer = z.input<typeof errorAnswer>;

export const tagsAnswer = z.object({ tags: z.array(listedTagSchema) });

export type TagsAnswer = z.input<typeof tagsAnswer>;

export const tagAnswer = z.object({ tag: tagSchema });

export type TagAnswer = z.input<typeof tagAnswer>;

export const coloursAnswer = z.object({
	colours: z.array(listedColourSchema),
});

export type ColoursAnswer = z.input<typeof coloursAnswer>;

export const colourAnswer = z.object({ colour: colourSchema });

export type ColourAnswer = z.input<typeof colourAnswer>;

export const brandsAnswer = z.object({
	brands: z.array(listedBrandSchema),
});

export type BrandsAnswer = z.input<typeof brandsAnswer>;

export const brandAnswer = z.object({ brand: brandSchema });

export type BrandAnswer = z.input<typeof brandAnswer>;

export const mannequinAnswer = z.object({ mannequin: mannequinSchema });

export type MannequinAnswer = z.input<typeof mannequinAnswer>;

export const combinationsAnswer = z.object({
	combinations: z.array(combinationSchema),
});

export type CombinationsAnswer = z.input<typeof combinationsAnswer>;

export const combinationAnswer = z.object({ combination: combinationSchema });

export type CombinationAnswer = z.input<typeof combinationAnswer>;

export const ownedItemsAnswer = z.object({
	ownedItems: z.array(ownedItemSchema),
});

export type OwnedItemsAnswer = z.input<typeof ownedItemsAnswer>;

export const ownedItemAnswer = z.object({ ownedItem: ownedItemSchema });

export type OwnedItemAnswer = z.input<typeof ownedItemAnswer>;

export const wishesAnswer = z.object({ wishes: z.array(wishSchema) });

export type WishesAnswer = z.input<typeof wishesAnswer>;

export const wishAnswer = z.object({ wish: wishSchema });

export type WishAnswer = z.input<typeof wishAnswer>;

export const pictureAnswer = z.object({
	picture: z.object({ id: pictureIdSchema }),
});

export type PictureAnswer = z.input<typeof pictureAnswer>;

export const aiAppsAnswer = z.object({ apps: z.array(aiAppSchema) });

export type AiAppsAnswer = z.input<typeof aiAppsAnswer>;

export const meAnswer = z.object({
	id: z.string(),
	name: z.string(),
	email: z.string(),
	image: z.string().nullable(),
});

export type MeAnswer = z.input<typeof meAnswer>;
