import { z } from "zod";
import { OWNED_ITEM_LIMIT, QUANTITY_MAX } from "@/closet/owned-item";
import { ITEM_PICTURE_LIMIT } from "@/pictures/picture";
import {
	matchesPieceFilter,
	ownedItemPiece,
} from "@/piece-filter/piece-filter";
import {
	addOwnedItem,
	changeOwnedItem,
	deleteOwnedItem,
	listOwnedItems,
	type OwnedItemError,
} from "../owned-item-store";
import {
	action,
	notAType,
	notYourBrand,
	notYourColour,
	type Refusal,
	type Refusals,
	serverError,
} from "./action";
import { pictureIdsInput } from "./pictures";
import {
	pieceFilterInput,
	pieceFilterOf,
	pieceFilterRefusals,
} from "./piece-filter";

// The sentence for one bad field of an owned item, with the value sent.
function fieldText(
	error: Extract<OwnedItemError, { code: "invalid" }>,
): string {
	switch (error.field) {
		case "quantity":
			return `Quantity is a whole number from 1 to ${QUANTITY_MAX}.`;
		case "typeId":
			return notAType(error.value);
		case "colourId":
			return notYourColour(error.value);
		case "brandId":
			return notYourBrand(error.value);
		case "pictureIds":
			return "pictureIds holds an id that is not your upload or a picture of this item. list_owned_items names the item's pictures; get_upload_address gives a new upload.";
		case "id":
		case "body":
			return serverError;
	}
}

// Bought refuses at the same limit with the same answer.
export const ownedItemLimit = (): Omit<Refusal, "code"> => ({
	status: 409,
	body: { error: "owned_item_limit" },
	text: `You have ${OWNED_ITEM_LIMIT} items. That is the limit. Delete one to add a new one.`,
});

const ownedItemRefusals: Refusals<OwnedItemError> = {
	invalid: (error) => ({
		status: 400,
		body: { error: "invalid", field: error.field },
		text: fieldText(error),
	}),
	duplicate: (error) => ({
		status: 409,
		body: { error: "duplicate", id: error.id },
		text: "You have this item already. Change its number.",
	}),
	owned_item_limit: ownedItemLimit,
	picture_limit: () => ({
		status: 409,
		body: { error: "picture_limit" },
		text: `An owned item has at most ${ITEM_PICTURE_LIMIT} pictures.`,
	}),
	not_found: () => ({
		status: 404,
		body: { error: "not_found" },
		text: "No owned item with this id.",
	}),
	conflict: () => ({
		status: 409,
		body: { error: "conflict", field: "id" },
		text: serverError,
	}),
};

// Loose types on purpose: a quantity of 0 must reach the store to get a
// sentence, since the SDK's own schema error is not one.
const itemFields = {
	brandId: z
		.string()
		.nullable()
		.optional()
		.describe(
			"A brand id from list_brands. Leave it out or send null for no brand.",
		),
	quantity: z
		.number()
		.describe(`How many the account owns, 1 to ${QUANTITY_MAX}.`),
	pictureIds: pictureIdsInput,
};

const id = z.string().describe("The owned item's id.");

export const ownedItemActions = {
	list: action(pieceFilterInput, pieceFilterRefusals, async (scope, input) => {
		const picked = await pieceFilterOf(scope, input);
		if (!picked.ok) return picked;
		const items = await listOwnedItems(scope.db, scope.userId);
		return {
			ok: true,
			value: items.filter((item) =>
				matchesPieceFilter(picked.value, ownedItemPiece(item)),
			),
		};
	}),
	add: action(
		z.object({
			id,
			typeId: z
				.string()
				.describe("A type id from list_types, such as shirt_l."),
			colourId: z.string().describe("A colour id from list_colours."),
			...itemFields,
		}),
		ownedItemRefusals,
		({ db, pictures, userId }, { brandId = null, ...item }) =>
			addOwnedItem(db, pictures, userId, { ...item, brandId }),
	),
	change: action(
		z.object({ id, ...itemFields }),
		ownedItemRefusals,
		({ db, pictures, userId }, { id, brandId = null, quantity, pictureIds }) =>
			changeOwnedItem(db, pictures, userId, id, {
				brandId,
				quantity,
				pictureIds,
			}),
	),
	delete: action(
		z.object({ id }),
		ownedItemRefusals,
		({ db, pictures, userId }, { id }) =>
			deleteOwnedItem(db, pictures, userId, id),
	),
};
