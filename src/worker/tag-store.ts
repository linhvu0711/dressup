import { and, asc, count, eq, sql } from "drizzle-orm";
import { type ListedTag, type Tag, type TagId, tagSchema } from "@/tags/tag";
import type { Db } from "./db";
import { combinationTag, tag } from "./db/tag-schema";
import { nameList } from "./name-list";
import type { Result } from "./result";

export type TagError =
	| { code: "name_length" }
	| { code: "duplicate"; name: string }
	| { code: "not_found" };

const toTag = (row: { id: string; name: string }): Tag => ({
	id: row.id as TagId,
	name: row.name,
});

// The account's tags in the order they were made: a new tag comes last, and
// a renamed one keeps its place. Each counts the combinations that carry it.
export async function listTags(db: Db, userId: string): Promise<ListedTag[]> {
	const rows = await db
		.select({
			id: tag.id,
			name: tag.name,
			combinations: sql<number>`(${db
				.select({ n: count() })
				.from(combinationTag)
				.where(eq(combinationTag.tagId, tag.id))})`,
		})
		.from(tag)
		.where(eq(tag.userId, userId))
		// Two adds in one millisecond share created_at; rowid keeps their order.
		.orderBy(asc(tag.createdAt), asc(sql`rowid`));
	return rows.map((row) => ({ ...toTag(row), combinations: row.combinations }));
}

const tags = nameList({ table: tag, index: "tag_userId_name_uq" });

export async function addTag(
	db: Db,
	userId: string,
	name: string,
): Promise<Result<Tag, TagError>> {
	const checked = tagSchema.shape.name.safeParse(name);
	if (!checked.success) return { ok: false, error: { code: "name_length" } };
	const added = await tags.add(db, userId, { name: checked.data });
	return added.ok ? { ok: true, value: toTag(added.value) } : added;
}

export async function renameTag(
	db: Db,
	userId: string,
	id: string,
	name: string,
): Promise<Result<Tag, TagError>> {
	const checked = tagSchema.shape.name.safeParse(name);
	if (!checked.success) return { ok: false, error: { code: "name_length" } };
	const renamed = await tags.change(db, userId, id, { name: checked.data });
	return renamed.ok ? { ok: true, value: toTag(renamed.value) } : renamed;
}

// Only the account's own tag goes, and with it the tag on each combination
// (the keys' cascade); not found when the account has no tag with this id.
export async function deleteTag(
	db: Db,
	userId: string,
	id: string,
): Promise<Result<Tag, TagError>> {
	const [row] = await db
		.delete(tag)
		.where(and(eq(tag.id, id), eq(tag.userId, userId)))
		.returning({ id: tag.id, name: tag.name });
	return row
		? { ok: true, value: toTag(row) }
		: { ok: false, error: { code: "not_found" } };
}
