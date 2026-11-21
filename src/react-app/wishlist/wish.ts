import { z } from "zod";
import { countText } from "@/count-text";
import { TYPE_IDS } from "@/dress/clothing-types";
import { brandSchema } from "@/labels/brand";
import { colourSchema } from "@/labels/colour";
import { pictureIdSchema } from "@/pictures/picture";
import { PRICE_MAX, priceSchema } from "@/price";

export const WISH_LIMIT = 200;

export const SHOP_LINK_LIMIT = 10;

export const ADDRESS_MAX = 2000;

export const SHOP_LINK_NAME_MAX = 80;

const wishIdSchema = z.uuid().brand<"WishId">();

export type WishId = z.infer<typeof wishIdSchema>;

// The rules for a wish as a website or an AI app sends it, so the server's
// check and the page's form agree. The colour is an id here; the store
// checks that it is the account's.
export const wishInputSchema = z.object({
	id: wishIdSchema,
	typeId: z.enum(TYPE_IDS),
	colourId: z.string(),
});

const shopLinkIdSchema = z.uuid().brand<"ShopLinkId">();

export type ShopLinkId = z.infer<typeof shopLinkIdSchema>;

// Only an http or https address that parses with a host: the page draws a
// saved address as a link, so a script address must never be saved.
const webAddressSchema = z
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

// The rules for a shop link as a website or an AI app sends it. The brand is
// an id here; the store checks that it is the account's.
export const shopLinkInputSchema = z.object({
	id: shopLinkIdSchema,
	url: webAddressSchema,
	brandId: z.string().nullable(),
	name: z.string().trim().min(1).max(SHOP_LINK_NAME_MAX),
	price: priceSchema,
	// The whole list; left out keeps the link's pictures, so an AI app that
	// sends none keeps them.
	pictureIds: z.array(z.string()).optional(),
});

export const shopLinkChangeSchema = shopLinkInputSchema.omit({ id: true });

// One add from the Wishlist: the piece, and its first shop link when the
// user gave an address.
export const wishlistAddSchema = wishInputSchema.extend({
	shopLink: shopLinkInputSchema.optional(),
});

const shopLinkSchema = z.object({
	id: shopLinkIdSchema,
	url: z.string(),
	brand: brandSchema.nullable(),
	name: z.string(),
	price: z.number().int().nullable(),
	// In the order they were uploaded.
	pictureIds: z.array(pictureIdSchema),
});

export type ShopLink = z.infer<typeof shopLinkSchema>;

export const wishSchema = z.object({
	id: wishIdSchema,
	typeId: z.enum(TYPE_IDS),
	colour: colourSchema,
	shopLinks: z.array(shopLinkSchema),
});

export type Wish = z.infer<typeof wishSchema>;

export type WishlistCard = { wish: Wish; link: ShopLink | null };

// The Wishlist's cards: each wish in list order, newest first, gives one card
// for each shop link, oldest first, or one card when it has none.
export const wishlistCards = (wishes: Wish[]): WishlistCard[] =>
	wishes.flatMap((wish): WishlistCard[] =>
		wish.shopLinks.length === 0
			? [{ wish, link: null }]
			: wish.shopLinks.map((link) => ({ wish, link })),
	);

export const linkPage = (id: ShopLinkId) => `/wishlist/link/${id}`;

export const wishPage = (id: WishId) => `/wishlist/wish/${id}`;

export const isWebAddress = (url: string): boolean =>
	webAddressSchema.safeParse(url).success;

// The shop's host without a leading "www.", or null when the address does not
// parse or has no host.
export function shopLinkHost(url: string): string | null {
	if (!URL.canParse(url)) return null;
	const { hostname } = new URL(url);
	return hostname === "" ? null : hostname.replace(/^www\./, "");
}

// What a shop link is called on the page: its brand, else its host, else
// the address as text.
export const shopName = (link: ShopLink): string =>
	link.brand?.name ?? shopLinkHost(link.url) ?? link.url;

// Dots as vi-VN writes them, with a plain space before ₫: the currency style
// puts a no-break space there.
const digits = new Intl.NumberFormat("vi-VN");

export const priceText = (price: number): string => `${digits.format(price)} ₫`;

const PRICE_DIGITS = String(PRICE_MAX).length;

// A price as the user types it: digits only, no leading zero, at most the
// digits of the highest price, shown with dots.
export function typedPrice(text: string): {
	value: number | null;
	shown: string;
} {
	const kept = text
		.replace(/\D/g, "")
		.replace(/^0+/, "")
		.slice(0, PRICE_DIGITS);
	if (kept === "") return { value: null, shown: "" };
	const value = Number(kept);
	return { value, shown: digits.format(value) };
}

// The second line of a wish's tile: how many links, and the lowest price
// when any link has one.
export function linksLine(wish: Wish): string {
	const n = wish.shopLinks.length;
	if (n === 0) return "No link yet";
	const count = countText(n, "link");
	const prices = wish.shopLinks.flatMap((link) =>
		link.price === null ? [] : [link.price],
	);
	return prices.length === 0
		? count
		: `${count} · from ${priceText(Math.min(...prices))}`;
}

// What the remove confirm says goes with the wish.
export function removeWishText(shopLinks: number): string {
	if (shopLinks === 0) return "It has no shop link.";
	return `Its ${countText(shopLinks, "shop link")} ${shopLinks === 1 ? "goes" : "go"} with it.`;
}

// What the remove confirm says goes with one shop link.
export const removeLinkText = (last: boolean): string =>
	last
		? "This is the last shop link, so the wish goes too."
		: "Only this shop link goes. The wish keeps its other shop links.";
