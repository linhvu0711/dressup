import { z } from "zod";
import { TAG_NAME_MAX } from "@/tags/tag";
import { addTag, deleteTag, renameTag, type TagError } from "../tag-store";
import { action, type Refusals } from "./action";

const tagRefusals: Refusals<TagError> = {
	name_length: () => ({
		status: 400,
		body: { error: "invalid", field: "name" },
		text: `A tag name has 1 to ${TAG_NAME_MAX} characters.`,
	}),
	duplicate: (error) => ({
		status: 400,
		body: { error: "duplicate", field: "name" },
		text: `You already have a tag called ${error.name}.`,
	}),
	not_found: () => ({
		status: 404,
		body: { error: "not_found" },
		text: "No tag with this id.",
	}),
};

export const tagActions = {
	add: action(
		z.object({ name: z.string().describe("The tag's name.") }),
		tagRefusals,
		({ db, userId }, { name }) => addTag(db, userId, name),
	),
	rename: action(
		z.object({
			id: z.string().describe("The tag's id."),
			name: z.string().describe("The tag's new name."),
		}),
		tagRefusals,
		({ db, userId }, { id, name }) => renameTag(db, userId, id, name),
	),
	delete: action(
		z.object({ id: z.string().describe("The tag's id.") }),
		tagRefusals,
		({ db, userId }, { id }) => deleteTag(db, userId, id),
	),
};
