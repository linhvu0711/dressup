import { z } from "zod";
import { COLOUR_LIMIT, COLOUR_NAME_MAX } from "@/labels/colour";
import {
	addColour,
	type ColourError,
	changeColour,
	deleteColour,
} from "../colour-store";
import { action, type Refusals } from "./action";

// A taken name is 409 here, as the colour contract says; tags answer 400.
const colourRefusals: Refusals<ColourError> = {
	invalid: (error) => ({
		status: 400,
		body: { error: "invalid", field: error.field },
		text:
			error.field === "name"
				? `A colour name has 1 to ${COLOUR_NAME_MAX} characters.`
				: "That is not a colour written as #RRGGBB with capital letters, such as #1F3A5F.",
	}),
	duplicate: (error) => ({
		status: 409,
		body: { error: "duplicate", field: "name" },
		text: `You already have a colour called ${error.name}.`,
	}),
	colour_limit: () => ({
		status: 409,
		body: { error: "colour_limit" },
		text: `You have ${COLOUR_LIMIT} colours. That is the limit. Delete one to add a new one.`,
	}),
	not_found: () => ({
		status: 404,
		body: { error: "not_found" },
		text: "No colour with this id.",
	}),
	colour_in_use: (error) => ({
		status: 409,
		body: { error: "colour_in_use" },
		text: `A combination, an owned item, or a wish uses ${error.name}, so it stays. A colour in use cannot be deleted.`,
	}),
};

export const colourActions = {
	add: action(
		z.object({
			name: z.string().describe("The colour's name."),
			hex: z.string().describe("The colour code, as #1F3A5F."),
		}),
		colourRefusals,
		({ db, userId }, input) => addColour(db, userId, input),
	),
	change: action(
		z.object({
			id: z.string().describe("The colour's id."),
			name: z.string().describe("The colour's new name."),
			hex: z.string().describe("The colour's new code, as #1F3A5F."),
		}),
		colourRefusals,
		({ db, userId }, { id, ...input }) => changeColour(db, userId, id, input),
	),
	delete: action(
		z.object({ id: z.string().describe("The colour's id.") }),
		colourRefusals,
		({ db, userId }, { id }) => deleteColour(db, userId, id),
	),
};
