import type { z } from "zod";
import { GARMENT_IDS, GARMENT_NAMES, JACKET_IDS } from "@/dress/garments";
import { MODES, type ModeId, modeById } from "@/dress/modes";
import { MANNEQUIN_PARTS } from "@/dress/state";

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
