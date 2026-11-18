import { z } from "zod";

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

// The store and the page cache both sort with this one rule, so a brand the
// page adds lands where the next load puts it.
export const byBrandName = (a: Brand, b: Brand): number =>
	a.name.localeCompare(b.name, "en", { sensitivity: "base" });
