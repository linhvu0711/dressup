import { and, asc, eq, sql } from "drizzle-orm";
import { sameTagName, type Tag, type TagId, tagSchema } from "@/tags/tag";
import type { Db } from "./db";
import { tag } from "./db/tag-schema";
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

// Two tabs can both pass the duplicate check; the index on lower(name) then
// refuses the second write, with an error that names the index. D1 and
// drizzle may wrap it, so the causes are read too.
const isNameTaken = (error: unknown): boolean =>
	error instanceof Error &&
	(error.message.includes("tag_userId_name_uq") || isNameTaken(error.cause));

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
	if (tags.some((t) => sameTagName(t.name, checked.data))) return duplicate;
	try {
		const [row] = await db
			.insert(tag)
			.values({ id: crypto.randomUUID(), userId, name: checked.data })
			.returning({ id: tag.id, name: tag.name });
		return { ok: true, value: toTag(row) };
	} catch (error) {
		if (isNameTaken(error)) return duplicate;
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
	if (tags.some((t) => t.id !== id && sameTagName(t.name, checked.data)))
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
		if (isNameTaken(error)) return duplicate;
		throw error;
	}
}

// Only the account's own tag goes, and with it the tag on each look; false
// when there is none to delete.
export async function deleteTag(
	db: Db,
	userId: string,
	id: string,
): Promise<boolean> {
	const rows = await db
		.delete(tag)
		.where(and(eq(tag.id, id), eq(tag.userId, userId)))
		.returning({ id: tag.id });
	return rows.length > 0;
}
