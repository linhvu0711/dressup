import { and, count, eq, sql } from "drizzle-orm";
import {
	BRAND_LIMIT,
	type Brand,
	type BrandId,
	brandInputSchema,
	byBrandName,
	type ListedBrand,
} from "@/labels/brand";
import { sameLabelName } from "@/labels/name";
import { type Db, hitsIndex } from "./db";
import { user } from "./db/auth-schema";
import { brand } from "./db/brand-schema";
import { ownedItem } from "./db/owned-item-schema";
import type { Result } from "./result";

export type BrandError =
	| { code: "invalid"; field: "name" }
	| { code: "duplicate"; name: string }
	| { code: "brand_limit" }
	| { code: "not_found" };

const NAME_INDEX = "brand_userId_name_uq";

const toBrand = (row: { id: string; name: string }): Brand => ({
	id: row.id as BrandId,
	name: row.name,
});

// The account's brands, A to Z, each with the count of owned items that
// have it.
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
		})
		.from(brand)
		.where(eq(brand.userId, userId));
	return rows
		.map((row) => ({ ...toBrand(row), items: row.items }))
		.sort(byBrandName);
}

type Checked = { ok: true; name: string } | { ok: false; error: BrandError };

function check(name: string): Checked {
	const parsed = brandInputSchema.safeParse({ name });
	return parsed.success
		? { ok: true, name: parsed.data.name }
		: { ok: false, error: { code: "invalid", field: "name" } };
}

// The server makes the id. The count sits in the insert, so two adds at once
// cannot both pass it.
export async function addBrand(
	db: Db,
	userId: string,
	input: string,
): Promise<Result<Brand, BrandError>> {
	const checked = check(input);
	if (!checked.ok) return checked;
	const { name } = checked;
	const duplicate = { ok: false, error: { code: "duplicate", name } } as const;
	const brands = await listBrands(db, userId);
	if (brands.some((b) => sameLabelName(b.name, name))) return duplicate;
	try {
		const [row] = await db
			.insert(brand)
			.select(
				db
					.select({
						id: sql<string>`${crypto.randomUUID()}`.as("id"),
						userId: user.id,
						name: sql<string>`${name}`.as("name"),
						createdAt:
							sql<number>`(cast(unixepoch('subsecond') * 1000 as integer))`.as(
								"created_at",
							),
					})
					.from(user)
					.where(
						and(
							eq(user.id, userId),
							sql`(${db
								.select({ n: count() })
								.from(brand)
								.where(eq(brand.userId, userId))}) < ${BRAND_LIMIT}`,
						),
					),
			)
			.returning({ id: brand.id, name: brand.name });
		return row
			? { ok: true, value: toBrand(row) }
			: { ok: false, error: { code: "brand_limit" } };
	} catch (error) {
		if (hitsIndex(error, NAME_INDEX)) return duplicate;
		throw error;
	}
}

// Renames only a brand the account has. A name the account's other brands
// hold is refused, so a change of letter case alone is taken.
export async function renameBrand(
	db: Db,
	userId: string,
	id: string,
	input: string,
): Promise<Result<Brand, BrandError>> {
	const checked = check(input);
	if (!checked.ok) return checked;
	const { name } = checked;
	const duplicate = { ok: false, error: { code: "duplicate", name } } as const;
	const brands = await listBrands(db, userId);
	if (brands.some((b) => b.id !== id && sameLabelName(b.name, name)))
		return duplicate;
	try {
		const [row] = await db
			.update(brand)
			.set({ name })
			.where(and(eq(brand.id, id), eq(brand.userId, userId)))
			.returning({ id: brand.id, name: brand.name });
		return row
			? { ok: true, value: toBrand(row) }
			: { ok: false, error: { code: "not_found" } };
	} catch (error) {
		if (hitsIndex(error, NAME_INDEX)) return duplicate;
		throw error;
	}
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
