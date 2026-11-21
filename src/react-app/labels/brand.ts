import { z } from "zod";
import { countText } from "@/count-text";

export const BRAND_NAME_MAX = 24;

export const BRAND_LIMIT = 100;

export const brandIdSchema = z.uuid().brand<"BrandId">();

export type BrandId = z.infer<typeof brandIdSchema>;

// The one rule for a brand's name, so the server's check, the AI tools, and
// the page's parse are the same.
export const brandInputSchema = z.object({
	name: z.string().trim().min(1).max(BRAND_NAME_MAX),
});

export const brandSchema = brandInputSchema.extend({ id: brandIdSchema });

export type Brand = z.infer<typeof brandSchema>;

// A brand in the account's list. items and shopLinks: how many owned items
// and shop links have it, so its delete can say how many lose their brand.
export const listedBrandSchema = brandSchema.extend({
	items: z.number().int().min(0),
	shopLinks: z.number().int().min(0),
});

export type ListedBrand = z.infer<typeof listedBrandSchema>;

// What the delete confirm says the delete does to the closet and the shop
// links.
export function brandDeleteText(items: number, shopLinks: number): string {
	if (shopLinks === 0) {
		if (items === 0) return "No item uses it.";
		return `${countText(items, "item")} ${items === 1 ? "loses its" : "lose their"} brand.`;
	}
	const links = countText(shopLinks, "shop link");
	if (items === 0)
		return shopLinks === 1
			? `${links} loses its brand.`
			: `${links} lose their brand.`;
	const owned = countText(items, "item");
	return `${owned} and ${links} lose their brand.`;
}

// The store and the page cache both sort with this one rule, so a brand the
// page adds lands where the next load puts it.
export const byBrandName = (a: Brand, b: Brand): number =>
	a.name.localeCompare(b.name, "en", { sensitivity: "base" });
