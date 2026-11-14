import { asc, eq, sql } from "drizzle-orm";
import { sameTagName, type Tag, type TagId } from "@/tags/tag";
import type { Db } from "./db";
import { tag } from "./db/tag-schema";

const toTag = (row: { id: string; name: string }): Tag => ({
	id: row.id as TagId,
	name: row.name,
});

// The account's tags in the order they were made: a new tag comes last, and
// a renamed one keeps its place.
export async function listTags(db: Db, userId: string): Promise<Tag[]> {
	const rows = await db
		.select({ id: tag.id, name: tag.name })
		.from(tag)
		.where(eq(tag.userId, userId))
		// Two adds in one millisecond share created_at; rowid keeps their order.
		.orderBy(asc(tag.createdAt), asc(sql`rowid`));
	return rows.map(toTag);
}

// The server makes the id: an add sent again after a lost answer finds its
// name taken, and the page reads the list again.
export async function addTag(
	db: Db,
	userId: string,
	name: string,
): Promise<{ ok: true; tag: Tag } | { ok: false; error: "duplicate" }> {
	const tags = await listTags(db, userId);
	if (tags.some((t) => sameTagName(t.name, name)))
		return { ok: false, error: "duplicate" };
	const [row] = await db
		.insert(tag)
		.values({ id: crypto.randomUUID(), userId, name })
		.returning({ id: tag.id, name: tag.name });
	return { ok: true, tag: toTag(row) };
}
