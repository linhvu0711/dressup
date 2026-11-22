import { z } from "zod";
import { pieceName } from "@/combinations/combination";
import { pieceKey } from "@/combinations/marks";
import { TYPE_IDS } from "@/dress/clothing-types";
import { brandSchema } from "@/labels/brand";
import { colourSchema } from "@/labels/colour";
import { pictureIdSchema } from "@/pictures/picture";
import { priceSchema, priceText } from "@/price";

export const OWNED_ITEM_LIMIT = 500;

export const QUANTITY_MAX = 99;

export const OWNED_ITEM_NAME_MAX = 80;

const ownedItemIdSchema = z.uuid().brand<"OwnedItemId">();

export type OwnedItemId = z.infer<typeof ownedItemIdSchema>;

export const ownedItemPage = (id: OwnedItemId) => `/closet/${id}`;

const quantitySchema = z.number().int().min(1).max(QUANTITY_MAX);

// A blank name is no name: the item goes by its piece's name.
const nameSchema = z
	.string()
	.trim()
	.max(OWNED_ITEM_NAME_MAX)
	.nullable()
	.transform((name) => name || null);

// The rules for an owned item as a website or an AI app sends it, so the
// server's check and the page's form agree. The colour and the brand are
// ids here; the store checks that they are the account's.
export const ownedItemInputSchema = z.object({
	id: ownedItemIdSchema,
	typeId: z.enum(TYPE_IDS),
	colourId: z.string(),
	brandId: z.string().nullable(),
	quantity: quantitySchema,
	name: nameSchema.optional(),
	price: priceSchema.optional(),
	pictureIds: z.array(z.string()).optional(),
});

// The piece of an owned item never changes; only its brand, quantity, name,
// price, and pictures do. pictureIds is the whole list; left out keeps the
// item's pictures, so an AI app that sends none keeps them. The name and the
// price left out keep the item's too, and null clears them.
export const ownedItemChangeSchema = z.object({
	brandId: z.string().nullable(),
	quantity: quantitySchema,
	name: nameSchema.optional(),
	price: priceSchema.optional(),
	pictureIds: z.array(z.string()).optional(),
});

export const ownedItemSchema = z.object({
	id: ownedItemIdSchema,
	typeId: z.enum(TYPE_IDS),
	colour: colourSchema,
	brand: brandSchema.nullable(),
	quantity: quantitySchema,
	name: z.string().nullable(),
	price: z.number().int().nullable(),
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

// The texts of an item's card. The label joins them, so a card is found by
// what it shows.
export function itemCard(item: OwnedItem): {
	title: string;
	line: string;
	price: string | null;
	badge: string | null;
	label: string;
} {
	const piece = pieceName(item);
	const title = item.name ?? piece;
	const line = item.brand ? `${item.brand.name} · ${piece}` : piece;
	const price = item.price === null ? null : priceText(item.price);
	const badge = item.quantity > 1 ? `×${item.quantity}` : null;
	const label = [title, line, price, badge]
		.filter((part) => part !== null)
		.join(", ");
	return { title, line, price, badge, label };
}
