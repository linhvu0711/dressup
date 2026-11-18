import { and, count, eq, sql } from "drizzle-orm";
import {
	BRAND_LIMIT,
	type Brand,
	type BrandId,
	brandInputSchema,
	byBrandName,
} from "@/labels/brand";
import { sameLabelName } from "@/labels/name";
import { type Db, hitsIndex } from "./db";
import { user } from "./db/auth-schema";
import { brand } from "./db/brand-schema";
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

// The account's brands, A to Z.
export async function listBrands(db: Db, userId: string): Promise<Brand[]> {
	const rows = await db
		.select({ id: brand.id, name: brand.name })
		.from(brand)
		.where(eq(brand.userId, userId));
	return rows.map(toBrand).sort(byBrandName);
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
