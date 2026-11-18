import type { z } from "zod";
import { OWNED_ITEM_LIMIT, QUANTITY_MAX } from "@/closet/owned-item";
import {
	COMBINATION_LIMIT,
	COMBINATION_TAGS_MAX,
} from "@/combinations/combination";
import {
	GARMENT_IDS,
	GARMENT_NAMES,
	JACKET_IDS,
	LAYER_NAMES,
} from "@/dress/garments";
import { MODES, type ModeId, modeById } from "@/dress/modes";
import { type DressError, MANNEQUIN_PARTS } from "@/dress/state";
import { BRAND_LIMIT, BRAND_NAME_MAX } from "@/labels/brand";
import { COLOUR_LIMIT, COLOUR_NAME_MAX } from "@/labels/colour";
import { LOOK_LIMIT, LOOK_NAME_MAX, LOOK_TAGS_MAX } from "@/looks/look";
import { ITEM_PICTURE_LIMIT } from "@/pictures/picture";
import { TAG_NAME_MAX } from "@/tags/tag";
import { PRICE_MAX, SHOP_LINK_LIMIT, WISH_LIMIT } from "@/wishlist/wish";
import type { BrandError } from "./brand-store";
import type { ColourError } from "./colour-store";
import type { CombinationError } from "./combination-store";
import type { LookError } from "./look-store";
import type { OwnedItemError } from "./owned-item-store";
import type { TagError } from "./tag-store";
import type { WishError } from "./wish-store";

// Every refusal an AI app gets names the value it sent and what is allowed,
// so the AI app can fix its call and try again.

const valueAt = (input: unknown, path: readonly PropertyKey[]): unknown =>
	path.reduce<unknown>(
		(value, key) =>
			value !== null && typeof value === "object"
				? (value as Record<PropertyKey, unknown>)[key]
				: undefined,
		input,
	);

const notGarment = (value: unknown) =>
	`${value} is not a garment. Garments: ${GARMENT_IDS.join(", ")}.`;

export function issueText(issue: z.core.$ZodIssue, input: unknown): string {
	const [field] = issue.path;
	const value = valueAt(input, issue.path);
	if (field === "modeId")
		return `${value} is not a mode. Modes: ${MODES.map((m) => m.id).join(", ")}.`;
	if (field === "garment") return notGarment(value);
	if (issue.code === "unrecognized_keys") return notGarment(issue.keys[0]);
	if (field === "jacket" || (field === "open" && issue.path.length === 2))
		return `${value} is not a jacket. Jackets: ${JACKET_IDS.join(", ")}.`;
	if (field === "part")
		return `${value} is not a mannequin part. Parts: ${MANNEQUIN_PARTS.join(", ")}.`;
	if (
		field === "hex" ||
		(field === "colours" && issue.code === "invalid_format")
	)
		return `${value} is not a colour written as #RRGGBB with capital letters, such as #1F3A5F.`;
	return `${issue.path.map(String).join(".")} is not valid.`;
}

// The issue's example: "This mode has: long polo, sweater, chino pants."
export const modeGarments = (modeId: ModeId): string =>
	modeById(modeId)
		.garments.map((id) => GARMENT_NAMES[id].toLowerCase())
		.join(", ");

export function dressRefusalText(error: DressError): string {
	switch (error.code) {
		case "not_in_row":
			return `${error.hex} is not in the ${error.garment} row. This row has: ${error.row.join(", ")}.`;
		case "last_square":
			return `${error.hex} is the last colour square of ${error.garment}. A row keeps at least one.`;
	}
}

export function tagRefusalText(error: TagError): string {
	switch (error.code) {
		case "name_length":
			return `A tag name has 1 to ${TAG_NAME_MAX} characters.`;
		case "duplicate":
			return `You already have a tag called ${error.name}.`;
		case "not_found":
			return noTag;
	}
}

export function colourRefusalText(error: ColourError): string {
	switch (error.code) {
		case "invalid":
			return error.field === "name"
				? `A colour name has 1 to ${COLOUR_NAME_MAX} characters.`
				: "That is not a colour written as #RRGGBB with capital letters, such as #1F3A5F.";
		case "duplicate":
			return `You already have a colour called ${error.name}.`;
		case "colour_limit":
			return `You have ${COLOUR_LIMIT} colours. That is the limit. Delete one to add a new one.`;
		case "not_found":
			return noColour;
		case "colour_in_use":
			return `A combination, an owned item, or a wish uses ${error.name}, so it stays. A colour in use cannot be deleted.`;
	}
}

export function brandRefusalText(error: BrandError): string {
	switch (error.code) {
		case "invalid":
			return `A brand name has 1 to ${BRAND_NAME_MAX} characters.`;
		case "duplicate":
			return `You already have a brand called ${error.name}.`;
		case "brand_limit":
			return `You have ${BRAND_LIMIT} brands. That is the limit. Delete one to add a new one.`;
		case "not_found":
			return noBrand;
	}
}

export function combinationRefusalText(error: CombinationError): string {
	switch (error.code) {
		case "pieces_count":
			return "A combination has 2 to 4 pieces.";
		case "same_layer":
			return `${GARMENT_NAMES[error.other]} and ${GARMENT_NAMES[error.typeId]} are both in the ${LAYER_NAMES[error.layer].toLowerCase()} layer. A combination has at most one piece for each layer.`;
		case "not_type":
			return notAType(error.value);
		case "not_colour":
			return notYourColour(error.value);
		case "not_tag":
			return `${error.value} is not one of your tags. list_tags names them.`;
		case "too_many_tags":
			return `A combination has at most ${COMBINATION_TAGS_MAX} tags.`;
		case "duplicate":
			return `You have this combination already, with id ${error.id}.`;
		case "combination_limit":
			return `You have ${COMBINATION_LIMIT} combinations. That is the limit.`;
		case "invalid":
			return issueText(error.issue, error.input);
		case "not_found":
			return noCombination;
		case "conflict":
			return serverError;
	}
}

// The sentence for one bad field of an owned item, with the value sent.
function ownedItemFieldText(
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
		case "id":
		case "pictureIds":
		case "body":
			return serverError;
	}
}

export function ownedItemRefusalText(error: OwnedItemError): string {
	switch (error.code) {
		case "invalid":
			return ownedItemFieldText(error);
		case "duplicate":
			return "You have this item already. Change its number.";
		case "owned_item_limit":
			return `You have ${OWNED_ITEM_LIMIT} items. That is the limit. Delete one to add a new one.`;
		case "picture_limit":
			return `An owned item has at most ${ITEM_PICTURE_LIMIT} pictures.`;
		case "not_found":
			return "No owned item with this id.";
		case "conflict":
			return serverError;
	}
}

// The sentence for one bad field of a wish or a shop link, with the value
// sent.
function wishFieldText(error: Extract<WishError, { code: "invalid" }>): string {
	switch (error.field) {
		case "url":
			return "Enter a web address that starts with https://.";
		case "name":
			return "Enter a name.";
		case "price":
			return `Price is a whole number of VND from 1 to ${new Intl.NumberFormat("vi-VN").format(PRICE_MAX)}.`;
		case "typeId":
			return notAType(error.value);
		case "colourId":
			return notYourColour(error.value);
		case "brandId":
			return notYourBrand(error.value);
		case "id":
		case "body":
			return serverError;
	}
}

// One tool acts on a wish or on a shop link; `subject` says which an id that
// is not found names.
export function wishRefusalText(
	error: WishError,
	subject: "wish" | "shop link",
): string {
	switch (error.code) {
		case "invalid":
			return wishFieldText(error);
		case "duplicate":
			return "You have this wish already.";
		case "wish_limit":
			return `You have ${WISH_LIMIT} wishes. That is the limit. Delete one to add a new one.`;
		case "shop_link_limit":
			return `${SHOP_LINK_LIMIT} shop links is the limit for one wish.`;
		case "not_found":
			return `No ${subject} with this id.`;
		case "conflict":
			return serverError;
	}
}

export const serverError = "dressup could not do this. Try again.";

export const tooManyActions = "Too many actions. Wait a minute and try again.";

export const noLook = "No look with this id.";

export const noTag = "No tag with this id.";

export const noColour = "No colour with this id.";

export const noBrand = "No brand with this id.";

export const noCombination = "No combination with this id.";

export const noLooks = "You have no saved looks yet.";

export const noTags = "You have no tags yet.";

export const noColours = "You have no colours yet.";

export const noCombinations = "You have no combinations yet.";

export const noCombinationsMatch = "No combination matches these filters.";

export const noBrands = "You have no brands yet.";

export const notAType = (value: unknown) =>
	`${value} is not a type. list_types names the types.`;

export const notYourColour = (value: unknown) =>
	`${value} is not one of your colours. list_colours names them.`;

export const notYourBrand = (value: unknown) =>
	`${value} is not one of your brands. list_brands names them.`;

export const noOwnedItems = "Nothing in your closet yet.";

export const noOwnedItemMatch = "No owned item matches the filter.";

export const noWishes = "Nothing on your wishlist yet.";

export const noWishMatch = "No wish matches the filter.";

export const lookLimit = (): string =>
	`You have ${LOOK_LIMIT} looks, the limit. Delete one first.`;

const notInMode = (garment: unknown, modeId: ModeId) =>
	`${garment} is not in mode ${modeId}. This mode has: ${modeGarments(modeId)}.`;

export function lookRefusalText(error: LookError): string {
	switch (error.code) {
		case "not_in_mode":
			return notInMode(error.garment, error.modeId);
		case "no_colour":
			return `${error.garment} needs a colour. Mode ${error.modeId} has: ${modeGarments(error.modeId)}.`;
		case "name_too_long":
			return `A look name has at most ${LOOK_NAME_MAX} characters.`;
		case "too_many_tags":
			return `A look has at most ${LOOK_TAGS_MAX} tags.`;
		case "invalid":
			return issueText(error.issue, error.input);
		case "look_limit":
			return lookLimit();
		case "not_found":
			return noLook;
		case "conflict":
		case "moved":
			return serverError;
	}
}

export const tagsLeftOffText = (ids: readonly string[]): string =>
	ids.map((id) => `Left off tag ${id}: no tag with this id.`).join(" ");
