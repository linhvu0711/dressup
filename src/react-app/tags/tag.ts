import { z } from "zod";

export const TAG_NAME_MAX = 24;

export const tagIdSchema = z.uuid().brand<"TagId">();

export type TagId = z.infer<typeof tagIdSchema>;

// The one shape of a tag, so the server's check and the page's parse are
// the same.
export const tagSchema = z.object({
	id: tagIdSchema,
	name: z.string().trim().min(1).max(TAG_NAME_MAX),
});

export type Tag = z.infer<typeof tagSchema>;

// The body of an add: the server makes the id.
export const newTagSchema = tagSchema.pick({ name: true });

// An account has each name once, in any letter case.
export const sameTagName = (a: string, b: string): boolean =>
	a.trim().toLowerCase() === b.trim().toLowerCase();
