import { z } from "zod";
import {
	COMBINATION_LIMIT,
	COMBINATION_TAGS_MAX,
} from "@/combinations/combination";
import { OWN_CHOICES } from "@/combinations/filter";
import { NO_PIECES, pieceKeys } from "@/combinations/marks";
import { LAYER_NAMES, TYPE_NAMES } from "@/dress/clothing-types";
import {
	type CombinationError,
	changeCombination,
	deleteCombination,
	findCombinations,
	saveCombination,
} from "../combination-store";
import { listOwnedPieces } from "../owned-item-store";
import {
	action,
	issueField,
	notAType,
	notYourColour,
	type Refusals,
	serverError,
} from "./action";

const issueText = (issue: z.core.$ZodIssue): string =>
	`${issue.path.map(String).join(".")} is not valid.`;

const badField = (error: { path: readonly PropertyKey[] }) => ({
	status: 400 as const,
	body: { error: "invalid" as const, field: issueField(error.path) },
});

const combinationRefusals: Refusals<CombinationError> = {
	not_type: (error) => ({
		...badField(error),
		text: notAType(error.value),
	}),
	not_colour: (error) => ({
		...badField(error),
		text: notYourColour(error.value),
	}),
	not_tag: (error) => ({
		...badField(error),
		text: `${error.value} is not one of your tags. list_tags names them.`,
	}),
	too_many_tags: (error) => ({
		...badField(error),
		text: `A combination has at most ${COMBINATION_TAGS_MAX} tags.`,
	}),
	pieces_count: (error) => ({
		...badField(error),
		text: "A combination has 2 to 4 pieces.",
	}),
	same_layer: (error) => ({
		...badField(error),
		text: `${TYPE_NAMES[error.other]} and ${TYPE_NAMES[error.typeId]} are both in the ${LAYER_NAMES[error.layer].toLowerCase()} layer. A combination has at most one piece for each layer.`,
	}),
	invalid: (error) => ({
		...badField(error),
		text: issueText(error.issue),
	}),
	conflict: () => ({
		status: 409,
		body: { error: "conflict", field: "id" },
		text: serverError,
	}),
	duplicate: (error) => ({
		status: 409,
		body: { error: "duplicate", id: error.id },
		text: `You have this combination already, with id ${error.id}.`,
	}),
	combination_limit: () => ({
		status: 409,
		body: { error: "combination_limit" },
		text: `You have ${COMBINATION_LIMIT} combinations. That is the limit.`,
	}),
	not_found: () => ({
		status: 404,
		body: { error: "not_found" },
		text: "No combination with this id.",
	}),
};

const pieces = z.array(
	z.object({
		typeId: z.string().describe("A type id from list_types, such as tee_l."),
		colourId: z.string().describe("A colour id from list_colours."),
	}),
);

const tags = z.array(z.string()).describe("Tag ids.");

const combinationInput = z.object({
	id: z.string().describe("The combination's id."),
	pieces,
	tags: tags.optional(),
});

export const combinationActions = {
	save: action(combinationInput, combinationRefusals, ({ db, userId }, input) =>
		saveCombination(db, userId, input),
	),
	change: action(
		combinationInput,
		combinationRefusals,
		({ db, userId }, { id, pieces, tags }) =>
			changeCombination(db, userId, id, { pieces, tags }),
	),
	delete: action(
		z.object({ id: z.string().describe("The combination's id.") }),
		combinationRefusals,
		({ db, userId }, { id }) => deleteCombination(db, userId, id),
	),
	list: action(
		z.object({
			pieces: z
				.array(
					z.object({
						typeId: z
							.string()
							.optional()
							.describe("A type id from list_types, such as tee_s."),
						colourId: z
							.string()
							.optional()
							.describe("A colour id from list_colours."),
					}),
				)
				.optional()
				.describe(
					"Piece rows. A combination is listed when, for each row, one of its pieces has the row's type and colour; a row may give only one of the two.",
				),
			tags: tags
				.optional()
				.describe(
					"Tag ids from list_tags. A combination is listed when it carries every one.",
				),
			own: z
				.enum(OWN_CHOICES)
				.optional()
				.describe(
					"Pieces I own. all lists the combinations whose every piece the closet has; not_all lists the ones with a piece it lacks; any, the default, lists them all.",
				),
		}),
		combinationRefusals,
		async ({ db, userId }, { pieces = [], tags = [], own = "any" }) =>
			findCombinations(
				db,
				userId,
				{ pieces, tags, own },
				own === "any"
					? NO_PIECES
					: pieceKeys(await listOwnedPieces(db, userId)),
			),
	),
};
