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

// A tag in the account's list, with how many combinations carry it.
export const listedTagSchema = tagSchema.extend({
	combinations: z.number().int().min(0),
});

export type ListedTag = z.infer<typeof listedTagSchema>;
