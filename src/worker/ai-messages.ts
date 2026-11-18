import type { z } from "zod";
import { GARMENT_IDS, GARMENT_NAMES, JACKET_IDS } from "@/dress/garments";
import { MODES, type ModeId, modeById } from "@/dress/modes";
import { type DressError, MANNEQUIN_PARTS } from "@/dress/state";
import { BRAND_LIMIT, BRAND_NAME_MAX } from "@/labels/brand";
import { COLOUR_LIMIT, COLOUR_NAME_MAX } from "@/labels/colour";
import { LOOK_LIMIT, LOOK_NAME_MAX, LOOK_TAGS_MAX } from "@/looks/look";
import { TAG_NAME_MAX } from "@/tags/tag";
import type { BrandError } from "./brand-store";
import type { ColourError } from "./colour-store";
import type { LookError } from "./look-store";
import type { TagError } from "./tag-store";

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

export const serverError = "dressup could not do this. Try again.";

export const tooManyActions = "Too many actions. Wait a minute and try again.";

export const noLook = "No look with this id.";

export const noTag = "No tag with this id.";

export const noColour = "No colour with this id.";

export const noBrand = "No brand with this id.";

export const noLooks = "You have no saved looks yet.";

export const noTags = "You have no tags yet.";

export const noColours = "You have no colours yet.";

export const noBrands = "You have no brands yet.";

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
