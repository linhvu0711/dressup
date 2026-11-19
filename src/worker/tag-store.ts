import { and, asc, count, eq, sql } from "drizzle-orm";
import { sameLabelName } from "@/labels/name";
import { type ListedTag, type Tag, type TagId, tagSchema } from "@/tags/tag";
import { type Db, hitsIndex } from "./db";
import { combinationTag, tag } from "./db/tag-schema";
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

// The server makes the id: an add sent again after a lost answer finds its
// name taken, and the page reads the list again.
export async function addTag(
	db: Db,
	userId: string,
	name: string,
): Promise<Result<Tag, TagError>> {
	const checked = tagSchema.shape.name.safeParse(name);
	if (!checked.success) return { ok: false, error: { code: "name_length" } };
	const duplicate = {
		ok: false,
		error: { code: "duplicate", name: checked.data },
	} as const;
	const tags = await listTags(db, userId);
	if (tags.some((t) => sameLabelName(t.name, checked.data))) return duplicate;
	try {
		const [row] = await db
			.insert(tag)
			.values({ id: crypto.randomUUID(), userId, name: checked.data })
			.returning({ id: tag.id, name: tag.name });
		return { ok: true, value: toTag(row) };
	} catch (error) {
		if (hitsIndex(error, "tag_userId_name_uq")) return duplicate;
		throw error;
	}
}

// Changes only a tag the account has. A name the account's other tags hold
// is refused, so a change of letter case alone is taken.
export async function renameTag(
	db: Db,
	userId: string,
	id: string,
	name: string,
): Promise<Result<Tag, TagError>> {
	const checked = tagSchema.shape.name.safeParse(name);
	if (!checked.success) return { ok: false, error: { code: "name_length" } };
	const duplicate = {
		ok: false,
		error: { code: "duplicate", name: checked.data },
	} as const;
	const tags = await listTags(db, userId);
	if (tags.some((t) => t.id !== id && sameLabelName(t.name, checked.data)))
		return duplicate;
	try {
		const [row] = await db
			.update(tag)
			.set({ name: checked.data })
			.where(and(eq(tag.id, id), eq(tag.userId, userId)))
			.returning({ id: tag.id, name: tag.name });
		return row
			? { ok: true, value: toTag(row) }
			: { ok: false, error: { code: "not_found" } };
	} catch (error) {
		if (hitsIndex(error, "tag_userId_name_uq")) return duplicate;
		throw error;
	}
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
