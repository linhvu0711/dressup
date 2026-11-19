import { z } from "zod";
import { pieceKey } from "@/combinations/marks";
import { TYPE_IDS } from "@/dress/clothing-types";
import { brandSchema } from "@/labels/brand";
import { colourSchema } from "@/labels/colour";
import { pictureIdSchema } from "@/pictures/picture";

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
	typeId: z.enum(TYPE_IDS),
	colourId: z.string(),
	brandId: z.string().nullable(),
	quantity: quantitySchema,
	pictureIds: z.array(z.string()).optional(),
});

// The piece of an owned item never changes; only its brand, quantity, and
// pictures do. pictureIds is the whole list; left out keeps the item's
// pictures, so an AI app that sends none keeps them.
export const ownedItemChangeSchema = z.object({
	brandId: z.string().nullable(),
	quantity: quantitySchema,
	pictureIds: z.array(z.string()).optional(),
});

export const ownedItemSchema = z.object({
	id: ownedItemIdSchema,
	typeId: z.enum(TYPE_IDS),
	colour: colourSchema,
	brand: brandSchema.nullable(),
	quantity: quantitySchema,
	// In the order they were uploaded.
	pictureIds: z.array(pictureIdSchema),
});

export type OwnedItem = z.infer<typeof ownedItemSchema>;

export type ClosetPiece = {
	typeId: OwnedItem["typeId"];
	colour: OwnedItem["colour"];
	quantity: number;
	items: OwnedItem[];
};

// One tile for each piece, with the total of its items. The list comes newest
// first, so the piece of the newest item leads.
export function closetPieces(items: readonly OwnedItem[]): ClosetPiece[] {
	const pieces = new Map<string, ClosetPiece>();
	for (const item of items) {
		const key = pieceKey(item);
		const piece = pieces.get(key);
		if (piece) {
			piece.quantity += item.quantity;
			piece.items.push(item);
		} else
			pieces.set(key, {
				typeId: item.typeId,
				colour: item.colour,
				quantity: item.quantity,
				items: [item],
			});
	}
	return [...pieces.values()];
}
