import { and, count, eq, sql } from "drizzle-orm";
import {
	BRAND_LIMIT,
	type Brand,
	type BrandId,
	brandInputSchema,
	byBrandName,
	type ListedBrand,
} from "@/labels/brand";
import type { Db } from "./db";
import { brand } from "./db/brand-schema";
import { ownedItem } from "./db/owned-item-schema";
import { shopLink } from "./db/wish-schema";
import { nameList } from "./name-list";
import type { Result } from "./result";

export type BrandError =
	| { code: "invalid"; field: "name" }
	| { code: "duplicate"; name: string }
	| { code: "brand_limit" }
	| { code: "not_found" };

const brands = nameList({
	table: brand,
	index: "brand_userId_name_uq",
	limit: { max: BRAND_LIMIT, code: "brand_limit" },
});

// The account's brand with this id, as a subquery: a write puts it in its
// own WHERE, so a brand deleted at the same time stops the write.
export const brandOf = (db: Db, userId: string, brandId: string) =>
	db
		.select({ one: sql`1` })
		.from(brand)
		.where(and(eq(brand.id, brandId), eq(brand.userId, userId)));

const toBrand = (row: { id: string; name: string }): Brand => ({
	id: row.id as BrandId,
	name: row.name,
});

// The account's brands, A to Z, each with the count of owned items and of
// shop links that have it.
export async function listBrands(
	db: Db,
	userId: string,
): Promise<ListedBrand[]> {
	const rows = await db
		.select({
			id: brand.id,
			name: brand.name,
			items: sql<number>`(${db
				.select({ n: count() })
				.from(ownedItem)
				.where(eq(ownedItem.brandId, brand.id))})`,
			shopLinks: sql<number>`(${db
				.select({ n: count() })
				.from(shopLink)
				.where(eq(shopLink.brandId, brand.id))})`,
		})
		.from(brand)
		.where(eq(brand.userId, userId));
	return rows
		.map((row) => ({
			...toBrand(row),
			items: row.items,
			shopLinks: row.shopLinks,
		}))
		.sort(byBrandName);
}

type Checked = { ok: true; name: string } | { ok: false; error: BrandError };

function check(name: string): Checked {
	const parsed = brandInputSchema.safeParse({ name });
	return parsed.success
		? { ok: true, name: parsed.data.name }
		: { ok: false, error: { code: "invalid", field: "name" } };
}

export async function addBrand(
	db: Db,
	userId: string,
	input: string,
): Promise<Result<Brand, BrandError>> {
	const checked = check(input);
	if (!checked.ok) return checked;
	const added = await brands.add(db, userId, { name: checked.name });
	return added.ok ? { ok: true, value: toBrand(added.value) } : added;
}

export async function renameBrand(
	db: Db,
	userId: string,
	id: string,
	input: string,
): Promise<Result<Brand, BrandError>> {
	const checked = check(input);
	if (!checked.ok) return checked;
	const renamed = await brands.change(db, userId, id, { name: checked.name });
	return renamed.ok ? { ok: true, value: toBrand(renamed.value) } : renamed;
}

// Only the account's own brand goes; not found when the account has no
// brand with this id.
export async function deleteBrand(
	db: Db,
	userId: string,
	id: string,
): Promise<Result<Brand, BrandError>> {
	const [row] = await db
		.delete(brand)
		.where(and(eq(brand.id, id), eq(brand.userId, userId)))
		.returning({ id: brand.id, name: brand.name });
	return row
		? { ok: true, value: toBrand(row) }
		: { ok: false, error: { code: "not_found" } };
}
