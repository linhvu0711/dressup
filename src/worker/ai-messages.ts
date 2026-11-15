import type { z } from "zod";
import { GARMENT_IDS, GARMENT_NAMES, JACKET_IDS } from "@/dress/garments";
import { MODES, type ModeId, modeById } from "@/dress/modes";
import { MANNEQUIN_PARTS } from "@/dress/state";
import { LOOK_LIMIT, LOOK_NAME_MAX, LOOK_TAGS_MAX } from "@/looks/look";
import { TAG_NAME_MAX } from "@/tags/tag";

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

export const notInRow = (
	garment: string,
	hex: string,
	row: readonly string[],
): string =>
	`${hex} is not in the ${garment} row. This row has: ${row.join(", ")}.`;

export const lastSquare = (garment: string, hex: string): string =>
	`${hex} is the last colour square of ${garment}. A row keeps at least one.`;

export const serverError = "dressup could not do this. Try again.";

export const tooManyActions = "Too many actions. Wait a minute and try again.";

export const noLook = "No look with this id.";

export const noTag = "No tag with this id.";

export const noLooks = "You have no saved looks yet.";

export const noTags = "You have no tags yet.";

export const tagNameLength = (): string =>
	`A tag name has 1 to ${TAG_NAME_MAX} characters.`;

export const tagNameTaken = (name: string): string =>
	`You already have a tag called ${name}.`;

export const lookLimit = (): string =>
	`You have ${LOOK_LIMIT} looks, the limit. Delete one first.`;

const notInMode = (garment: unknown, modeId: ModeId) =>
	`${garment} is not in mode ${modeId}. This mode has: ${modeGarments(modeId)}.`;

// A look's issues, as lookInputSchema gives them; the mode is known to be
// valid when an issue names it.
export function lookIssueText(
	issue: z.core.$ZodIssue,
	input: { modeId: string; open: readonly string[] },
): string {
	const [field, key] = issue.path;
	const modeId = input.modeId as ModeId;
	if (issue.code === "custom" && issue.message === "not in the mode")
		return field === "open"
			? notInMode(
					input.open.find(
						(id) =>
							!(modeById(modeId).garments as readonly string[]).includes(id),
					),
					modeId,
				)
			: notInMode(key, modeId);
	if (issue.code === "custom" && issue.message === "no colour")
		return `${String(key)} needs a colour. Mode ${modeId} has: ${modeGarments(modeId)}.`;
	if (field === "name")
		return `A look name has at most ${LOOK_NAME_MAX} characters.`;
	if (field === "tags")
		return key === undefined
			? `A look has at most ${LOOK_TAGS_MAX} tags.`
			: noTag;
	return issueText(issue, input);
}
